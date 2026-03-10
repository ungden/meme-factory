import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const { data: settings } = await supabaseAdmin
      .from("system_settings")
      .select("key, value");

    const result: Record<string, unknown> = {};
    for (const s of settings ?? []) {
      result[s.key] = s.value;
    }

    return NextResponse.json({ settings: result });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const { key, value } = body as { key: string; value: unknown };

    if (!key) {
      return NextResponse.json({ error: "Thiếu key" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("system_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: "Lưu cấu hình thất bại" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
