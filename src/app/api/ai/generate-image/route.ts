import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import {
  generateMemeImage,
  generateCharacterPose,
  generateBackground,
} from "@/lib/gemini-image";
import { POINT_COSTS, POINT_LABELS, type PointAction } from "@/lib/point-pricing";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 60;

function getPointAction(type: string): PointAction {
  switch (type) {
    case "character": return "character";
    case "background": return "background";
    case "meme": return "meme";
    default: return "meme";
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để sử dụng tính năng này" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type } = body;

    if (!type || !["meme", "character", "background"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'meme', 'character', or 'background'." },
        { status: 400 }
      );
    }

    // ============================================
    // Point System — Atomic Deduct via RPC
    // ============================================
    const action = getPointAction(type);
    const cost = POINT_COSTS[action];

    if (cost > 0) {
      const { data: deductResult, error: deductRpcErr } = await supabaseAdmin.rpc("atomic_deduct_points", {
        _user_id: user.id,
        _cost: cost,
        _description: `${POINT_LABELS[action]} (-${cost} points)`,
      });

      if (deductRpcErr) {
        throw new Error(`Lỗi trừ points: ${deductRpcErr.message}`);
      }

      if (!deductResult?.success) {
        const currentPoints = deductResult?.points ?? 0;
        return NextResponse.json(
          {
            error: `Không đủ points. ${POINT_LABELS[action]} cần ${cost} points, bạn có ${currentPoints} points.`,
            code: "INSUFFICIENT_POINTS",
            required: cost,
            current: currentPoints,
          },
          { status: 402 }
        );
      }
    }

    let result: { image: string; text?: string };

    try {
      switch (type) {
        case "meme": {
          const {
            headline, subtext, tone, textPosition, characters: chars,
            format, style, backgroundDescription, referenceImages, customPrompt, watermark,
          } = body;

          if (!headline && !customPrompt) {
            // Refund points since we already deducted
            if (cost > 0) {
              await supabaseAdmin.rpc("atomic_refund_points", {
                _user_id: user.id, _cost: cost,
                _description: `Hoàn ${cost} pts — thiếu headline/prompt`,
              });
            }
            return NextResponse.json(
              { error: "Cần headline hoặc prompt mô tả để tạo meme" },
              { status: 400 }
            );
          }

          result = await generateMemeImage({
            headline, subtext, tone: tone || "hài hước",
            textPosition: textPosition || "top", characters: chars || [],
            format: format || "1:1", style, backgroundDescription, referenceImages, customPrompt, watermark,
          });
          break;
        }

        case "character": {
          const { characterName, characterDescription, emotion, style, existingPoseImages } = body;

          if (!characterName || !characterDescription || !emotion) {
            if (cost > 0) {
              await supabaseAdmin.rpc("atomic_refund_points", {
                _user_id: user.id, _cost: cost,
                _description: `Hoàn ${cost} pts — thiếu thông tin nhân vật`,
              });
            }
            return NextResponse.json(
              { error: "characterName, characterDescription, and emotion are required" },
              { status: 400 }
            );
          }

          result = await generateCharacterPose({
            characterName, characterDescription, emotion, style, existingPoseImages,
          });
          break;
        }

        case "background": {
          const { description, mood, format } = body;

          if (!description) {
            if (cost > 0) {
              await supabaseAdmin.rpc("atomic_refund_points", {
                _user_id: user.id, _cost: cost,
                _description: `Hoàn ${cost} pts — thiếu mô tả background`,
              });
            }
            return NextResponse.json(
              { error: "description is required for background generation" },
              { status: 400 }
            );
          }

          result = await generateBackground({
            description, mood, format: format || "1:1",
          });
          break;
        }

        default:
          return NextResponse.json({ error: "Unknown type" }, { status: 400 });
      }
    } catch (genError) {
      // Atomic refund on generation failure + audit trail
      if (cost > 0) {
        await supabaseAdmin.rpc("atomic_refund_points", {
          _user_id: user.id,
          _cost: cost,
          _description: `Hoàn ${cost} pts — lỗi tạo ${POINT_LABELS[action]}`,
        });
      }
      throw genError;
    }

    // Record point usage transaction (only on success)
    if (cost > 0) {
      await supabaseAdmin.from("transactions").insert({
        user_id: user.id,
        amount: 0,
        type: "payment",
        description: `${POINT_LABELS[action]} (-${cost} points)`,
        status: "completed",
      });
    }

    return NextResponse.json({
      image: result.image,
      text: result.text,
      pointsUsed: cost,
    });
  } catch (error) {
    console.error("Image generation error:", error);

    const rawMessage =
      error instanceof Error ? error.message : "";

    // Sanitize: only return safe, user-facing messages — never leak model names, API keys, or internal details
    let userMessage = "Không thể tạo ảnh. Vui lòng thử lại.";

    if (rawMessage.includes("not configured") || rawMessage.includes("AI_KEY_NOT_CONFIGURED")) {
      return NextResponse.json(
        { error: "Hệ thống AI chưa được cấu hình. Vui lòng liên hệ admin.", code: "NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    if (rawMessage.includes("Không nhận được kết quả")) {
      userMessage = "AI không trả về kết quả. Vui lòng thử lại.";
    } else if (rawMessage.includes("không tạo được ảnh")) {
      userMessage = "AI không tạo được ảnh. Vui lòng thử mô tả khác.";
    } else if (rawMessage.includes("Không đủ points") || rawMessage.includes("INSUFFICIENT_POINTS")) {
      userMessage = rawMessage; // Point messages are safe to show
    } else if (rawMessage.includes("Lỗi trừ points")) {
      userMessage = "Lỗi hệ thống khi xử lý points. Vui lòng thử lại.";
    } else if (rawMessage.includes("SAFETY") || rawMessage.includes("blocked")) {
      userMessage = "Nội dung bị từ chối bởi bộ lọc an toàn. Vui lòng thử ý tưởng khác.";
    } else if (rawMessage.includes("quota") || rawMessage.includes("rate limit") || rawMessage.includes("429")) {
      userMessage = "Hệ thống đang quá tải. Vui lòng thử lại sau ít phút.";
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
