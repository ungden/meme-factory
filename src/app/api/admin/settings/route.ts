import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin, AdminError } from "@/lib/admin";
import { checkMargin, parsePointCosts, type PointAction } from "@/lib/point-pricing";
import { invalidatePointCostCache } from "@/lib/point-pricing.server";

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
          .map((margin) => `${margin.action}: ${margin.points} điểm không đủ bù ${margin.worstCostVnd}đ chi phí, cần tối thiểu ${margin.minimumPoints}`)
          .join("; ");
        return NextResponse.json({ error: `Giá thấp hơn chi phí — ${detail}` }, { status: 400 });
      }
    }

    const { error } = await supabaseAdmin
      .from("system_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: "Lưu cấu hình thất bại" }, { status: 500 });
    }

    if (key === "point_costs") invalidatePointCostCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
