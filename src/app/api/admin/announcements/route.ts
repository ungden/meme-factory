import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const { data: announcements } = await supabaseAdmin
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    return NextResponse.json({ announcements: announcements ?? [] });
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
    const { title, content, type } = body as { title: string; content: string; type: string };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Thiếu tiêu đề" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("announcements")
      .insert({ title: title.trim(), content: content?.trim() || "", type: type || "info" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Tạo thông báo thất bại" }, { status: 500 });
    }

    return NextResponse.json({ announcement: data });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const { id, is_active } = body as { id: string; is_active: boolean };

    if (!id) {
      return NextResponse.json({ error: "Thiếu ID" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("announcements")
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Cập nhật thất bại" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Thiếu ID" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("announcements")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Xoá thất bại" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
