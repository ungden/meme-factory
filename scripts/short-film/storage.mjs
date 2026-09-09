import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat, statfs } from "node:fs/promises";
import path from "node:path";

export const VIDEO_MAX_BYTES = 1024 ** 3;
export const OTHER_MEDIA_MAX_BYTES = 100 * 1024 ** 2;
export const STANDARD_UPLOAD_MAX_BYTES = 6 * 1024 ** 2;
export const TUS_CHUNK_BYTES = 6 * 1024 ** 2;
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

export function assertMediaSize(size, mime) {
  if (!Number.isSafeInteger(size) || size < 0)
    throw new Error("Kích thước media không hợp lệ.");
  if (mime === "video/mp4" && size > VIDEO_MAX_BYTES)
    throw new Error("Video vượt giới hạn 1 GiB.");
  if (mime !== "video/mp4" && size > OTHER_MEDIA_MAX_BYTES)
    throw new Error("Media không phải video vượt giới hạn 100 MiB.");
}

export async function ensureDiskSpace(target, requiredBytes) {
  const report = await statfs(path.dirname(target));
  const available = Number(report.bavail) * Number(report.bsize);
  if (!Number.isFinite(available) || available < requiredBytes)
    throw new Error("Worker không đủ dung lượng đĩa tạm để xử lý media.");
  return available;
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function directStorageEndpoint(supabaseUrl) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co"))
    url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  url.hash = "";
  return url;
}

function metadataHeader(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key} ${Buffer.from(String(value)).toString("base64")}`)
    .join(",");
}

function retryable(status) {
  return status === 423 || status === 429 || status >= 500;
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retryRequest(run, label) {
  let last;
  for (const wait of RETRY_DELAYS) {
    if (wait) await delay(wait);
    try {
      const response = await run();
      if (response.ok || !retryable(response.status)) return response;
      last = new Error(`${label} thất bại (${response.status}).`);
    } catch (error) {
      last = error;
    }
  }
  throw last || new Error(`${label} thất bại.`);
}

async function objectInfo(storage, storagePath) {
  const { data, error } = await storage.info(storagePath);
  if (error) {
    const status = Number(error.status || error.statusCode || 0);
    if (status === 404 || /not found|does not exist|missing/i.test(String(error.message)))
      return null;
    throw error;
  }
  return data;
}

async function verifyObject(storage, storagePath, size) {
  for (const wait of [0, 300, 1000, 2000, 4000]) {
    if (wait) await delay(wait);
    const info = await objectInfo(storage, storagePath);
    if (info) {
      if (Number(info.size) !== size)
        throw new Error("Object đã lưu không khớp kích thước nguồn.");
      return info;
    }
  }
  throw new Error("Không xác minh được object sau khi upload.");
}

async function createTusUpload({ endpoint, token, bucket, storagePath, mime, size, sha256, fetchImpl }) {
  const response = await retryRequest(
    () =>
      fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tus-resumable": "1.0.0",
          "upload-length": String(size),
          "upload-metadata": metadataHeader({
            bucketName: bucket,
            objectName: storagePath,
            contentType: mime,
            cacheControl: "3600",
            metadata: JSON.stringify({ sha256 }),
          }),
          "x-upsert": "false",
        },
        signal: AbortSignal.timeout(120000),
      }),
    "Khởi tạo upload",
  );
  if (!response.ok)
    throw new Error(`Không khởi tạo được upload (${response.status}).`);
  const location = response.headers.get("location");
  if (!location) throw new Error("Supabase không trả URL upload.");
  const uploadUrl = new URL(location, endpoint);
  if (uploadUrl.protocol !== "https:" || uploadUrl.origin !== endpoint.origin)
    throw new Error("Supabase trả URL upload không hợp lệ.");
  return uploadUrl.href;
}

async function readTusOffset(uploadUrl, endpoint, token, fetchImpl) {
  const checked = new URL(uploadUrl);
  if (checked.protocol !== "https:" || checked.origin !== endpoint.origin) return null;
  const response = await retryRequest(
    () =>
      fetchImpl(checked, {
        method: "HEAD",
        headers: {
          authorization: `Bearer ${token}`,
          "tus-resumable": "1.0.0",
        },
        signal: AbortSignal.timeout(30000),
      }),
    "Đọc tiến độ upload",
  );
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok)
    throw new Error(`Không đọc được tiến độ upload (${response.status}).`);
  const offset = Number(response.headers.get("upload-offset"));
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
}

async function tusUpload(options) {
  const {
    file,
    size,
    sha256,
    mime,
    bucket,
    storagePath,
    supabaseUrl,
    serviceRoleKey,
    previous,
    onCheckpoint,
    fetchImpl,
  } = options;
  const endpoint = directStorageEndpoint(supabaseUrl);
  let uploadUrl =
    previous?.sha256 === sha256 &&
    previous?.size === size &&
    previous?.storagePath === storagePath
      ? previous.uploadUrl
      : null;
  let offset = uploadUrl
    ? await readTusOffset(uploadUrl, endpoint, serviceRoleKey, fetchImpl)
    : null;
  if (offset === null) {
    uploadUrl = await createTusUpload({
      endpoint,
      token: serviceRoleKey,
      bucket,
      storagePath,
      mime,
      size,
      sha256,
      fetchImpl,
    });
    offset = 0;
  }
  if (offset > size)
    throw new Error("Supabase trả tiến độ upload vượt kích thước file.");
  await onCheckpoint?.({ uploadUrl, storagePath, sha256, size, offset });
  const handle = await open(file, "r");
  try {
    while (offset < size) {
      const length = Math.min(TUS_CHUNK_BYTES, size - offset);
      const chunk = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(chunk, 0, length, offset);
      if (bytesRead !== length) throw new Error("Không đọc đủ dữ liệu upload.");
      let response;
      try {
        // Never blindly retry PATCH. A timeout can happen after the server
        // accepted the bytes, and resending at the old offset corrupts the
        // resumable session. HEAD below is the recovery authority.
        response = await fetchImpl(uploadUrl, {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${serviceRoleKey}`,
            "tus-resumable": "1.0.0",
            "upload-offset": String(offset),
            "content-type": "application/offset+octet-stream",
          },
          body: chunk,
          signal: AbortSignal.timeout(120000),
        });
      } catch (error) {
        // A connection can die after Supabase accepted a chunk. Reconcile
        // with HEAD before retrying so the same bytes are never sent twice.
        const remote = await readTusOffset(uploadUrl, endpoint, serviceRoleKey, fetchImpl);
        if (remote === offset + bytesRead) {
          offset = remote;
          await onCheckpoint?.({ uploadUrl, storagePath, sha256, size, offset });
          continue;
        }
        if (remote === offset)
          throw new Error("Upload chưa được xác nhận; worker sẽ thử lại từ checkpoint.");
        throw error;
      }
      if (!response.ok) {
        if (response.status === 409) {
          const remote = await readTusOffset(uploadUrl, endpoint, serviceRoleKey, fetchImpl);
          if (remote === offset + bytesRead) {
            offset = remote;
            await onCheckpoint?.({ uploadUrl, storagePath, sha256, size, offset });
            continue;
          }
          throw new Error("Upload bị xung đột với offset không thể đối soát.");
        }
        if (response.status === 404 || response.status === 410)
          throw new Error("Phiên upload đã hết hạn; worker sẽ tạo phiên mới.");
        throw new Error(`Upload media thất bại (${response.status}).`);
      }
      const next = Number(response.headers.get("upload-offset"));
      if (!Number.isSafeInteger(next) || next !== offset + bytesRead)
        throw new Error("Supabase trả tiến độ upload không hợp lệ.");
      offset = next;
      await onCheckpoint?.({ uploadUrl, storagePath, sha256, size, offset });
    }
  } finally {
    await handle.close();
  }
}

export async function uploadMedia({
  db,
  bucket = "content-media",
  prefix,
  file,
  name,
  mime,
  previous,
  onCheckpoint,
  supabaseUrl = process.env.SUPABASE_URL,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl = fetch,
}) {
  const { size } = await stat(file);
  assertMediaSize(size, mime);
  const sha256 = await sha256File(file);
  const storagePath = `${prefix}/${sha256.slice(0, 16)}-${name}`;
  const storage = db.storage.from(bucket);
  const existing = await objectInfo(storage, storagePath);
  if (existing) {
    if (Number(existing.size) !== size)
      throw new Error("Object trùng tên nhưng sai kích thước.");
  } else if (size <= STANDARD_UPLOAD_MAX_BYTES) {
    const { error } = await storage.upload(storagePath, createReadStream(file), {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
      metadata: { sha256 },
    });
    if (error) throw error;
  } else {
    if (!supabaseUrl || !serviceRoleKey)
      throw new Error("Worker thiếu cấu hình Supabase để upload resumable.");
    await tusUpload({
      file,
      size,
      sha256,
      mime,
      bucket,
      storagePath,
      supabaseUrl,
      serviceRoleKey,
      previous,
      onCheckpoint,
      fetchImpl,
    });
  }
  await verifyObject(storage, storagePath, size);
  const completed = { storagePath, sha256, size, offset: size, completed: true };
  await onCheckpoint?.(completed);
  console.log("Media stored", { storagePath, bytes: size, resumable: size > STANDARD_UPLOAD_MAX_BYTES });
  return completed;
}
