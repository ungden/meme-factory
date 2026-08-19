// ============================================
// MIRROR of src/lib/image-metadata.ts — keep in sync
// ============================================
//
// The mobile app is a separate package and cannot import from the web `src/`
// tree, but it uploads user photos straight into the same public bucket, so it
// needs the same EXIF/XMP/C2PA stripping. `image-metadata.mirror.test.ts` in the
// web package fails if these two files drift apart.
//
// Everything below this header is copied verbatim.
// ============================================
// Image metadata stripping
// ============================================
// Ảnh do AI sinh ra thường mang theo metadata nguồn gốc (EXIF, XMP, IPTC,
// C2PA/Content Credentials, text chunk...) nằm ngoài phần pixel. Trước khi ảnh
// rời hệ thống (trả về client, upload lên storage) ta gỡ toàn bộ những phần đó
// và chỉ giữ lại các block bắt buộc để ảnh render đúng.
//
// GIỚI HẠN (quan trọng, đừng hiểu nhầm): việc này chỉ xoá metadata trong file.
// Nó KHÔNG gỡ được watermark ẩn (SynthID của Google, watermark của Meta AI...)
// vì loại đó được mã hoá vào chính tín hiệu pixel, cũng không qua mặt được các
// classifier phát hiện ảnh AI. Xem docs/image-metadata.md.
//
// Không phụ thuộc thư viện ngoài và không đụng vào pixel: ta chỉ bỏ nguyên khối
// các chunk/segment metadata, nên dữ liệu ảnh (và CRC của chunk được giữ lại)
// vẫn nguyên vẹn, không hề re-encode / giảm chất lượng.

export type ImageContainerFormat = "png" | "jpeg" | "webp" | "unknown";

export interface StripImageMetadataResult {
  bytes: Uint8Array;
  format: ImageContainerFormat;
  /** Tên các chunk/segment đã bị gỡ, ví dụ ["iTXt", "eXIf"] hoặc ["APP1", "COM"]. */
  removed: string[];
  /** Số byte tiết kiệm được. */
  bytesRemoved: number;
}

// PNG: chỉ giữ các chunk ảnh hưởng tới việc render (kể cả APNG animation).
// Mọi thứ khác — tEXt/zTXt/iTXt (XMP, prompt, "Software"), eXIf, caBX (C2PA),
// iCCP/sRGB/gAMA, chunk riêng của từng tool — đều bị gỡ.
const PNG_KEPT_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "tRNS",
  "IDAT",
  "IEND",
  // APNG
  "acTL",
  "fcTL",
  "fdAT",
]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// WebP: EXIF / XMP / ICC profile là metadata thuần, gỡ được mà không đụng pixel.
const WEBP_STRIPPED_CHUNKS = new Set(["EXIF", "XMP ", "ICCP"]);

// Bit cờ trong byte đầu của chunk VP8X (RIFF WebP extended header).
const VP8X_FLAG_ICC = 0x20;
const VP8X_FLAG_EXIF = 0x08;
const VP8X_FLAG_XMP = 0x04;

/**
 * Gỡ metadata khỏi một ảnh PNG / JPEG / WebP.
 *
 * Không bao giờ throw: nếu định dạng lạ hoặc file hỏng thì trả lại nguyên bytes
 * đầu vào — thà giữ metadata còn hơn làm hỏng ảnh của người dùng.
 */
export function stripImageMetadata(input: Uint8Array): StripImageMetadataResult {
  const unchanged = (format: ImageContainerFormat): StripImageMetadataResult => ({
    bytes: input,
    format,
    removed: [],
    bytesRemoved: 0,
  });

  try {
    if (isPng(input)) {
      return finalize(stripPng(input), input, "png");
    }
    if (isJpeg(input)) {
      return finalize(stripJpeg(input), input, "jpeg");
    }
    if (isWebp(input)) {
      return finalize(stripWebp(input), input, "webp");
    }
    return unchanged("unknown");
  } catch {
    // Parser gặp file dị dạng — trả nguyên bản, đừng phá ảnh.
    return unchanged(detectFormat(input));
  }
}

/**
 * Bản base64 của {@link stripImageMetadata}, giữ nguyên prefix `data:` nếu có.
 * Trả lại chuỗi gốc nếu không decode/strip được.
 */
export function stripImageMetadataFromBase64(value: string): string {
  if (!value) return value;

  const separator = ";base64,";
  const separatorIndex = value.startsWith("data:") ? value.indexOf(separator) : -1;
  const payloadStart = separatorIndex >= 0 ? separatorIndex + separator.length : 0;
  const prefix = value.slice(0, payloadStart);
  const payload = value.slice(payloadStart);

  try {
    const decoded = base64ToBytes(payload);
    if (decoded.length === 0) return value;

    const { bytes, bytesRemoved } = stripImageMetadata(decoded);
    if (bytesRemoved === 0) return value;

    return prefix + bytesToBase64(bytes);
  } catch {
    return value;
  }
}

/**
 * Bản dùng cho File/Blob phía trình duyệt — gỡ metadata trước khi upload lên
 * storage công khai (ảnh người dùng chọn từ máy thường còn nguyên EXIF, kể cả
 * toạ độ GPS và model máy ảnh).
 *
 * Trả lại chính file gốc nếu không có gì để gỡ hoặc gặp lỗi.
 */
export async function stripImageMetadataFromFile(file: File): Promise<File>;
export async function stripImageMetadataFromFile(file: Blob): Promise<Blob>;
export async function stripImageMetadataFromFile(file: File | Blob): Promise<File | Blob> {
  try {
    const original = new Uint8Array(await file.arrayBuffer());
    const result = stripImageMetadata(original);
    if (result.bytesRemoved === 0) return file;

    const blob = new Blob([result.bytes as unknown as BlobPart], { type: file.type });
    return file instanceof File
      ? new File([blob], file.name, { type: file.type, lastModified: file.lastModified })
      : blob;
  } catch {
    return file;
  }
}

// ============================================
// PNG
// ============================================

function stripPng(input: Uint8Array): { parts: Uint8Array[]; removed: string[] } {
  const parts: Uint8Array[] = [input.subarray(0, PNG_SIGNATURE.length)];
  const removed: string[] = [];

  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= input.length) {
    const dataLength = readUint32BE(input, offset);
    const type = readAscii(input, offset + 4, 4);
    const chunkEnd = offset + 12 + dataLength; // length + type + data + crc

    if (dataLength > input.length || chunkEnd > input.length) {
      // Chunk khai báo dài hơn file — dừng lại và giữ nguyên phần đuôi.
      parts.push(input.subarray(offset));
      return { parts, removed };
    }

    if (PNG_KEPT_CHUNKS.has(type)) {
      parts.push(input.subarray(offset, chunkEnd));
    } else {
      removed.push(type);
    }

    offset = chunkEnd;

    if (type === "IEND") {
      // Mọi thứ sau IEND không phải dữ liệu ảnh (một số tool nhét metadata ở đây).
      if (offset < input.length) removed.push("TRAILER");
      return { parts, removed };
    }
  }

  return { parts, removed };
}

// ============================================
// JPEG
// ============================================

function stripJpeg(input: Uint8Array): { parts: Uint8Array[]; removed: string[] } {
  const parts: Uint8Array[] = [input.subarray(0, 2)]; // SOI
  const removed: string[] = [];

  let offset = 2;
  while (offset + 1 < input.length) {
    if (input[offset] !== 0xff) {
      // Mất đồng bộ — copy nốt phần còn lại nguyên trạng.
      parts.push(input.subarray(offset));
      return { parts, removed };
    }

    // 0xFF có thể lặp lại làm fill byte trước marker thật.
    let markerPos = offset;
    while (markerPos < input.length && input[markerPos] === 0xff) markerPos += 1;
    if (markerPos >= input.length) {
      parts.push(input.subarray(offset));
      return { parts, removed };
    }

    const marker = input[markerPos];

    if (marker === 0xd9) {
      // EOI — bỏ mọi byte thừa phía sau (chỗ hay bị nhét metadata/ảnh thumbnail).
      parts.push(input.subarray(offset, markerPos + 1));
      if (markerPos + 1 < input.length) removed.push("TRAILER");
      return { parts, removed };
    }

    // Marker đứng một mình, không có phần độ dài.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(offset, markerPos + 1));
      offset = markerPos + 1;
      continue;
    }

    const lengthPos = markerPos + 1;
    if (lengthPos + 1 >= input.length) {
      parts.push(input.subarray(offset));
      return { parts, removed };
    }

    const segmentLength = (input[lengthPos] << 8) | input[lengthPos + 1];
    const segmentEnd = lengthPos + segmentLength; // segmentLength gồm cả 2 byte độ dài
    if (segmentLength < 2 || segmentEnd > input.length) {
      parts.push(input.subarray(offset));
      return { parts, removed };
    }

    if (isJpegMetadataSegment(input, marker, lengthPos + 2, segmentEnd)) {
      removed.push(jpegMarkerLabel(marker));
    } else {
      parts.push(input.subarray(offset, segmentEnd));
    }

    offset = segmentEnd;

    if (marker === 0xda) {
      // Sau SOS là entropy-coded data: copy nguyên khối tới marker thật kế tiếp.
      const scanEnd = findNextJpegMarker(input, segmentEnd);
      parts.push(input.subarray(segmentEnd, scanEnd));
      offset = scanEnd;
    }
  }

  if (offset < input.length) parts.push(input.subarray(offset));
  return { parts, removed };
}

function isJpegMetadataSegment(
  input: Uint8Array,
  marker: number,
  dataStart: number,
  dataEnd: number
): boolean {
  if (marker === 0xfe) return true; // COM — comment

  // APP0: giữ JFIF/JFXX vì chúng mô tả cách hiển thị, không phải nguồn gốc.
  if (marker === 0xe0) {
    const identifier = readAscii(input, dataStart, Math.min(5, dataEnd - dataStart));
    return !(identifier.startsWith("JFIF") || identifier.startsWith("JFXX"));
  }

  // APP1..APP15: EXIF, XMP, ICC, Photoshop/IPTC, JUMBF (C2PA), MPF...
  return marker >= 0xe1 && marker <= 0xef;
}

function jpegMarkerLabel(marker: number): string {
  if (marker === 0xfe) return "COM";
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0}`;
  return `0x${marker.toString(16).toUpperCase()}`;
}

/** Tìm marker JPEG thật tiếp theo, bỏ qua byte stuffing (FF 00) và RSTn. */
function findNextJpegMarker(input: Uint8Array, from: number): number {
  let index = from;
  while (index + 1 < input.length) {
    if (input[index] === 0xff) {
      const next = input[index + 1];
      const isStuffing = next === 0x00;
      const isRestart = next >= 0xd0 && next <= 0xd7;
      const isFill = next === 0xff;
      if (!isStuffing && !isRestart && !isFill) return index;
    }
    index += 1;
  }
  return input.length;
}

// ============================================
// WebP (RIFF)
// ============================================

function stripWebp(input: Uint8Array): { parts: Uint8Array[]; removed: string[] } {
  const header = new Uint8Array(input.subarray(0, 12)); // "RIFF" + size + "WEBP"
  const parts: Uint8Array[] = [header];
  const removed: string[] = [];

  let offset = 12;
  let payloadSize = 4; // "WEBP" đã nằm trong header

  while (offset + 8 <= input.length) {
    const fourCC = readAscii(input, offset, 4);
    const chunkSize = readUint32LE(input, offset + 4);
    const padded = chunkSize + (chunkSize % 2);
    const chunkEnd = offset + 8 + padded;

    if (chunkSize > input.length || chunkEnd > input.length) {
      // Chunk cụt: giữ phần còn lại nguyên trạng và bỏ qua việc sửa kích thước.
      const rest = input.subarray(offset);
      parts.push(rest);
      payloadSize += rest.length;
      break;
    }

    if (WEBP_STRIPPED_CHUNKS.has(fourCC)) {
      removed.push(fourCC.trim());
    } else if (fourCC === "VP8X") {
      // Gỡ chunk rồi thì phải tắt cờ tương ứng, nếu không decoder sẽ đi tìm.
      const chunk = new Uint8Array(input.subarray(offset, chunkEnd));
      if (chunk.length > 8) {
        chunk[8] &= ~(VP8X_FLAG_ICC | VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
      }
      parts.push(chunk);
      payloadSize += chunk.length;
    } else {
      parts.push(input.subarray(offset, chunkEnd));
      payloadSize += chunkEnd - offset;
    }

    offset = chunkEnd;
  }

  writeUint32LE(header, 4, payloadSize);
  return { parts, removed };
}

// ============================================
// Helpers
// ============================================

function finalize(
  result: { parts: Uint8Array[]; removed: string[] },
  input: Uint8Array,
  format: ImageContainerFormat
): StripImageMetadataResult {
  if (result.removed.length === 0) {
    return { bytes: input, format, removed: [], bytesRemoved: 0 };
  }
  const bytes = concatBytes(result.parts);
  return {
    bytes,
    format,
    removed: result.removed,
    bytesRemoved: input.length - bytes.length,
  };
}

function detectFormat(input: Uint8Array): ImageContainerFormat {
  if (isPng(input)) return "png";
  if (isJpeg(input)) return "jpeg";
  if (isWebp(input)) return "webp";
  return "unknown";
}

function isPng(input: Uint8Array): boolean {
  if (input.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => input[index] === byte);
}

function isJpeg(input: Uint8Array): boolean {
  return input.length >= 4 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
}

function isWebp(input: Uint8Array): boolean {
  return (
    input.length >= 12 &&
    readAscii(input, 0, 4) === "RIFF" &&
    readAscii(input, 8, 4) === "WEBP"
  );
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function readAscii(input: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length && offset + i < input.length; i += 1) {
    out += String.fromCharCode(input[offset + i]);
  }
  return out;
}

function readUint32BE(input: Uint8Array, offset: number): number {
  return (
    ((input[offset] << 24) >>> 0) +
    (input[offset + 1] << 16) +
    (input[offset + 2] << 8) +
    input[offset + 3]
  );
}

function readUint32LE(input: Uint8Array, offset: number): number {
  return (
    input[offset] +
    (input[offset + 1] << 8) +
    (input[offset + 2] << 16) +
    ((input[offset + 3] << 24) >>> 0)
  );
}

function writeUint32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
