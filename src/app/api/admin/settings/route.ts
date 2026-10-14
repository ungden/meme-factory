import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";
import { checkMargin, parsePointCosts, type PointAction } from "@/lib/point-pricing";
import { invalidatePointCostCache } from "@/lib/point-pricing.server";
import { formatNumber, formatPoints } from "@/lib/format";
import { actionLabel } from "@/components/admin/admin-labels";

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
    return NextResponse.json({ error: "Có lỗi phía hệ thống. Thử lại sau nhé." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const { key, value } = body as { key: string; value: unknown };

    if (!key) {
      return NextResponse.json({ error: "Thiếu tên mục cấu hình." }, { status: 400 });
    }

    // Prices are enforced now, so a bad edit would really sell below cost.
    if (key === "point_costs") {
      const parsed = parsePointCosts(value);
      if (!parsed) {
        return NextResponse.json(
          { error: "Bảng giá không hợp lệ: mỗi hành động phải là số nguyên không âm." },
          { status: 400 }
        );
      }

      const unsafe = (Object.keys(parsed) as PointAction[])
        .map((action) => checkMargin(action, parsed[action]))
        .filter((margin) => margin.points > 0 && !margin.coversCost);

      if (unsafe.length > 0) {
        const detail = unsafe
          .map(
            (margin) =>
              `${actionLabel(margin.action)}: ${formatPoints(margin.points)} không đủ bù ${formatNumber(margin.worstCostVnd)}đ chi phí, cần tối thiểu ${formatPoints(margin.minimumPoints)}`,
          )
          .join("; ");
        return NextResponse.json({ error: `Giá thấp hơn chi phí. ${detail}.` }, { status: 400 });
      }
    }

    const { error } = await supabaseAdmin
      .from("system_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: "Chưa lưu được cấu hình. Thử lại nhé." }, { status: 500 });
    }

    if (key === "point_costs") invalidatePointCostCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Có lỗi phía hệ thống. Thử lại sau nhé." }, { status: 500 });
  }
}
