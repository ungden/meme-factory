import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-auth";
import { getSupabaseAdmin } from "@/lib/admin";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 500;
type Page<T> = { data: T[] | null; error: { message: string } | null };

/** Never turn a successful first page into a silently truncated export. */
async function allRows<T>(read: (from: number, to: number) => PromiseLike<Page<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await read(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
    // A bounded route must fail explicitly instead of returning an incomplete archive.
    if (rows.length >= 50_000) throw new Error("Dữ liệu quá lớn để xuất trong một tệp; hãy liên hệ hỗ trợ để nhận bản xuất đầy đủ.");
  }
}

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
    const projects = await allRows((from, to) => admin
      .from("projects")
      .select("id, name, slug, description, style_prompt, created_at")
      .eq("user_id", user.id)
      .range(from, to));
    const projectIds = projects.map((project) => project.id as string);

    const [characters, sets, transactions, projectTransactions, plans, wallet] = await Promise.all([
      projectIds.length
        ? allRows((from, to) => admin.from("characters").select("id, project_id, name, description, personality, created_at").in("project_id", projectIds).range(from, to))
        : Promise.resolve([]),
      projectIds.length
        ? allRows((from, to) => admin.from("content_sets").select("id, project_id, brief, status, created_at").in("project_id", projectIds).range(from, to))
        : Promise.resolve([]),
      allRows((from, to) => admin.from("transactions").select("amount, type, description, status, created_at").eq("user_id", user.id).range(from, to)),
      projectIds.length
        ? allRows((from, to) => admin.from("project_transactions").select("project_id, amount, type, description, status, ai_action, metadata, created_at").in("project_id", projectIds).range(from, to))
        : Promise.resolve([]),
      projectIds.length
        ? allRows((from, to) => admin.from("video_plans").select("id, project_id, title, brief, story, status, version, created_at, updated_at").in("project_id", projectIds).range(from, to))
        : Promise.resolve([]),
      admin.from("wallets").select("balance, points, free_trial_claimed").eq("user_id", user.id).maybeSingle(),
    ]);

    // content_outputs nối với dự án qua content_sets, không có project_id riêng.
    const setIds = sets.map((set) => set.id as string);
    const outputs = setIds.length
      ? await allRows((from, to) => admin
          .from("content_outputs")
          .select("id, content_set_id, kind, format, caption, media_url, status, source_snapshot, created_at")
          .in("content_set_id", setIds)
          .range(from, to))
      : [];

    const payload = {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        name: (user.user_metadata as Record<string, unknown> | null)?.full_name ?? null,
        createdAt: user.created_at,
      },
      wallet: wallet.data ?? null,
      projects,
      characters,
      contentSets: sets,
      outputs,
      transactions,
      projectTransactions,
      videoPlans: plans,
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
