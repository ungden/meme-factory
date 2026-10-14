import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Thiếu mã kênh." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Chưa xoá được kênh. Thử lại nhé." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Có lỗi phía hệ thống. Thử lại sau nhé." }, { status: 500 });
  }
}
