import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const [path, out] = process.argv.slice(2);
const { data, error } = await db.storage.from("content-media").createSignedUrl(path, 600);
if (error) { console.error(error.message); process.exit(1); }
const res = await fetch(data.signedUrl);
if (!res.ok) { console.error("tải hỏng", res.status); process.exit(1); }
await writeFile(out, Buffer.from(await res.arrayBuffer()));
console.log("đã lưu", out);
