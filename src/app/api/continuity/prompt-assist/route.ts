import { NextRequest, NextResponse } from "next/server";
import { generateShotDirection, type ShotDirectionIngredient } from "@/lib/gemini";
import { getRequestUser } from "@/lib/supabase/request-auth";

type PromptAssistRequest = {
  projectId?: string;
  currentPrompt?: string;
  policy?: "strict" | "balanced" | "creative";
  framing?: string;
  lens?: string;
  aspect?: string;
  ingredients?: ShotDirectionIngredient[];
};

const validKinds = new Set(["character", "look", "item", "environment", "style"]);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PromptAssistRequest;
    if (!body.projectId) {
      return NextResponse.json({ error: "Thiếu dự án." }, { status: 400 });
    }

    const { supabase, user } = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", body.projectId)
      .single();
    if (!project) {
      return NextResponse.json({ error: "Không tìm thấy dự án." }, { status: 404 });
    }

    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients
          .filter((item): item is ShotDirectionIngredient => Boolean(
            item
            && typeof item.name === "string"
            && item.name.trim()
            && validKinds.has(item.kind)
          ))
          .slice(0, 16)
          .map((item) => ({
            name: item.name.trim().slice(0, 120),
            kind: item.kind,
            notes: typeof item.notes === "string" ? item.notes.trim().slice(0, 500) : undefined,
          }))
      : [];

    const result = await generateShotDirection({
      currentPrompt: typeof body.currentPrompt === "string" ? body.currentPrompt.trim().slice(0, 4000) : "",
      policy: ["strict", "balanced", "creative"].includes(body.policy || "") ? body.policy! : "balanced",
      framing: typeof body.framing === "string" ? body.framing.slice(0, 80) : "Trung cảnh toàn thân",
      lens: typeof body.lens === "string" ? body.lens.slice(0, 80) : "Chân dung 50mm",
      aspect: typeof body.aspect === "string" ? body.aspect.slice(0, 20) : "16:9",
      ingredients,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Shot direction assist error:", error);
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: message.includes("AI_KEY_NOT_CONFIGURED")
          ? "Hệ thống AI chưa được cấu hình. Vui lòng liên hệ quản trị viên."
          : "AI chưa thể tối ưu chỉ đạo cảnh quay. Vui lòng thử lại.",
      },
      { status: 500 },
    );
  }
}
