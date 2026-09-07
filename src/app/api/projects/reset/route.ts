import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { getRequestUser } from "@/lib/supabase/request-auth";

const BUCKETS = ["character-poses", "memes", "base-images", "meme-templates", "content-media"] as const;
type StoredObject = { bucket: (typeof BUCKETS)[number]; path: string; bytes: number };

async function listPrefix(bucket: (typeof BUCKETS)[number], prefix: string): Promise<StoredObject[]> {
  const admin = getSupabaseAdmin();
  const out: StoredObject[] = [];
  const walk = async (path: string) => {
    const { data, error } = await admin.storage.from(bucket).list(path, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Không thể kiểm kê ${bucket}: ${error.message}`);
    for (const item of data ?? []) {
      const child = path ? `${path}/${item.name}` : item.name;
      if (item.id) out.push({ bucket, path: child, bytes: Number(item.metadata?.size ?? 0) }); else await walk(child);
    }
  };
  await walk(prefix);
  return out;
}

async function projectInventory(project: { id: string; slug: string | null; name: string }) {
  const admin = getSupabaseAdmin();
  const [characters, poses, baseImages, assets, versions, references, memes, collections, contentSets, outputs, jobs, drafts] = await Promise.all([
    admin.from("characters").select("*").eq("project_id", project.id),
    admin.from("character_poses").select("*, characters!inner(project_id)").eq("characters.project_id", project.id),
    admin.from("mascot_base_images").select("*, characters!inner(project_id)").eq("characters.project_id", project.id),
    admin.from("assets").select("*").eq("project_id", project.id),
    admin.from("asset_versions").select("*, assets!inner(project_id)").eq("assets.project_id", project.id),
    admin.from("reference_images").select("*, asset_versions!inner(assets!inner(project_id))").eq("asset_versions.assets.project_id", project.id),
    admin.from("memes").select("*").eq("project_id", project.id),
    admin.from("meme_collections").select("*").eq("project_id", project.id),
    admin.from("content_sets").select("*").eq("project_id", project.id),
    admin.from("content_outputs").select("*, content_sets!inner(project_id)").eq("content_sets.project_id", project.id),
    admin.from("generation_jobs").select("*").eq("project_id", project.id),
    admin.from("workspace_drafts").select("*").eq("project_id", project.id),
  ]);
  const records = { characters: characters.data ?? [], poses: poses.data ?? [], baseImages: baseImages.data ?? [], assets: assets.data ?? [], versions: versions.data ?? [], references: references.data ?? [], memes: memes.data ?? [], collections: collections.data ?? [], contentSets: contentSets.data ?? [], outputs: outputs.data ?? [], jobs: jobs.data ?? [], drafts: drafts.data ?? [] };
  const activeJobs = records.jobs.filter((job) => ["queued", "running"].includes(job.status));
  const prefixes = [...new Set([project.id, project.slug].filter((value): value is string => Boolean(value)))];
  const objects = (await Promise.all(BUCKETS.flatMap((bucket) => prefixes.map((prefix) => listPrefix(bucket, prefix))))).flat();
  return { records, activeJobs: activeJobs.map((job) => job.id), objects };
}

function manifestFor(project: { id: string; slug: string | null; name: string }, inventory: Awaited<ReturnType<typeof projectInventory>>) {
  const counts = Object.fromEntries(Object.entries(inventory.records).map(([name, records]) => [name, records.length]));
  return { project: { id: project.id, slug: project.slug, name: project.name }, counts, objectCount: inventory.objects.length, totalBytes: inventory.objects.reduce((total, object) => total + object.bytes, 0), activeJobCount: inventory.activeJobs.length };
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: projects, error } = await supabase.from("projects").select("id, slug, name").eq("user_id", user.id).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const inventories = await Promise.all((projects ?? []).map(async (project) => manifestFor(project, await projectInventory(project))));
  return NextResponse.json({ projects: inventories, retentionDays: 30, eligibleProjectCount: inventories.length });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const body = await request.json();
  if (body.confirm !== "RESET_OWNED_WORKSPACE") return NextResponse.json({ error: "Xác nhận reset không hợp lệ." }, { status: 400 });
  const { data: projects } = await supabase.from("projects").select("id, slug, name, workspace_version").eq("user_id", user.id).order("created_at", { ascending: true });
  if (!projects?.length) return NextResponse.json({ projects: [], message: "Không có dự án bạn sở hữu để reset." });
  const selected = Array.isArray(body.project_ids) ? new Set(body.project_ids.filter((id: unknown): id is string => typeof id === "string")) : new Set(projects.map((project) => project.id));
  const targets = projects.filter((project) => selected.has(project.id));
  if (!targets.length) return NextResponse.json({ error: "Không có dự án hợp lệ để reset." }, { status: 400 });
  const admin = getSupabaseAdmin();
  const completed: { projectId: string; backupId: string; workspaceVersion: number }[] = [];
  for (const project of targets) {
    const inventory = await projectInventory(project);
    if (inventory.activeJobs.length) return NextResponse.json({ error: `Dự án ${project.name} còn ${inventory.activeJobs.length} job đang chạy. Reset chưa được thực hiện.`, activeJobs: inventory.activeJobs }, { status: 409 });
    const manifest = { ...manifestFor(project, inventory), records: inventory.records, objects: inventory.objects };
    const manifestSha = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
    const prefix = `${user.id}/${project.id}/${Date.now()}`;
    let copied = 0;
    for (const object of inventory.objects) {
      const { data, error } = await admin.storage.from(object.bucket).download(object.path);
      if (error || !data) throw new Error(`Không sao lưu được ${object.bucket}/${object.path}: ${error?.message ?? "missing"}`);
      const bytes = new Uint8Array(await data.arrayBuffer());
      const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
      const backupPath = `${prefix}/media/${object.bucket}/${object.path}`;
      const { error: uploadError } = await admin.storage.from("workspace-reset-backups").upload(backupPath, bytes, { contentType: data.type || "application/octet-stream", upsert: false, metadata: { source_sha256: checksum, source_bucket: object.bucket, source_path: object.path } });
      if (uploadError) throw new Error(`Không ghi được bản sao lưu: ${uploadError.message}`);
      copied++;
    }
    const { data: backup, error: backupError } = await admin.schema("private").from("workspace_reset_backups").insert({ owner_user_id: user.id, project_id: project.id, workspace_version_before: project.workspace_version, status: "verified", manifest, manifest_sha256: manifestSha, storage_prefix: prefix, object_count: copied, total_bytes: inventory.objects.reduce((total, object) => total + object.bytes, 0), verified_at: new Date().toISOString() }).select("id").single();
    if (backupError || !backup) throw new Error(backupError?.message || "Không lưu được manifest backup.");
    const { data: nextVersion, error: resetError } = await admin.schema("private").rpc("reset_owned_project_workspace", { _project_id: project.id, _owner_user_id: user.id, _backup_id: backup.id });
    if (resetError) throw new Error(resetError.message);
    for (const object of inventory.objects) {
      const { error: removeError } = await admin.storage.from(object.bucket).remove([object.path]);
      if (removeError) throw new Error(`Đã reset dữ liệu nhưng không xoá được media ${object.bucket}/${object.path}: ${removeError.message}`);
    }
    completed.push({ projectId: project.id, backupId: backup.id, workspaceVersion: Number(nextVersion) });
  }
  return NextResponse.json({ projects: completed, retentionDays: 30 });
}
