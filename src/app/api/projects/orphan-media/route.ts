import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/admin";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { projectInventory } from "@/app/api/projects/reset/route";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const { data: projects } = await supabase.from("projects").select("id, slug, name").eq("user_id", user.id);
  const admin = getSupabaseAdmin();
  let deleted = 0;
  for (const project of projects ?? []) {
    const inventory = await projectInventory(project);
    const byBucket = new Map<string, string[]>();
    for (const object of inventory.objects) byBucket.set(object.bucket, [...(byBucket.get(object.bucket) ?? []), object.path]);
    for (const [bucket, paths] of byBucket) {
      for (let index = 0; index < paths.length; index += 100) {
        const batch = paths.slice(index, index + 100);
        const { error } = await admin.storage.from(bucket).remove(batch);
        if (error) return NextResponse.json({ error: error.message, deleted }, { status: 500 });
        deleted += batch.length;
      }
    }
  }
  return NextResponse.json({ deleted });
}
