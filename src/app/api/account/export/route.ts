import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/export — tải toàn bộ dữ liệu của tài khoản dưới dạng JSON.
 *
 * Chính sách bảo mật hứa người dùng lấy lại được dữ liệu của mình; đây là chỗ
 * thực hiện lời hứa đó. Chỉ xuất siêu dữ liệu và đường dẫn media (file thật nằm
 * trong storage và tải qua link trong ứng dụng), nên phản hồi luôn nhỏ.
 */
export async function GET(request: NextRequest) {
  const { user } = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    const { data: projects } = await admin
      .from("projects")
      .select("id, name, slug, description, style_prompt, created_at")
      .eq("user_id", user.id);
    const projectIds = (projects || []).map((project) => project.id as string);

    const [characters, sets, transactions, wallet] = await Promise.all([
      projectIds.length
        ? admin.from("characters").select("id, project_id, name, description, personality, created_at").in("project_id", projectIds)
        : Promise.resolve({ data: [] }),
      projectIds.length
        ? admin.from("content_sets").select("id, project_id, brief, status, created_at").in("project_id", projectIds).limit(1000)
        : Promise.resolve({ data: [] }),
      admin.from("transactions").select("amount, type, description, status, created_at").eq("user_id", user.id).limit(1000),
      admin.from("wallets").select("balance, points, free_trial_claimed").eq("user_id", user.id).maybeSingle(),
    ]);

    // content_outputs nối với dự án qua content_sets, không có project_id riêng.
    const setIds = (sets.data || []).map((set) => set.id as string);
    const { data: outputs } = setIds.length
      ? await admin
          .from("content_outputs")
          .select("id, content_set_id, kind, format, caption, media_url, status, created_at")
          .in("content_set_id", setIds)
          .limit(2000)
      : { data: [] };

    const payload = {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        name: (user.user_metadata as Record<string, unknown> | null)?.full_name ?? null,
        createdAt: user.created_at,
      },
      wallet: wallet.data ?? null,
      projects: projects ?? [],
      characters: characters.data ?? [],
      contentSets: sets.data ?? [],
      outputs: outputs ?? [],
      transactions: transactions.data ?? [],
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="aida-du-lieu-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    await reportError(error, { scope: "account.export", tags: { userId: user.id } });
    return NextResponse.json({ error: "Chưa xuất được dữ liệu. Thử lại sau nhé." }, { status: 500 });
  }
}
