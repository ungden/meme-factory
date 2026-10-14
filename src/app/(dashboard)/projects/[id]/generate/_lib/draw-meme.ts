import type { ImageGenMemeParams, MemeContent, SelectedCharacter } from "@/types/database";

export type DrawMemeResult =
  | {
      ok: true;
      /** Base64 của ảnh; rỗng khi máy chủ trả lại meme đã lưu từ lần gửi trước. */
      image: string;
      imageUrl: string | null;
      memeId: string | null;
      requestId: string | null;
      pointsUsed: number;
      droppedReferences: number;
    }
  | {
      ok: false;
      /** Không nhận được trả lời: có thể máy chủ vẫn đang vẽ với mã này. */
      network: boolean;
      error: string;
      code?: string;
      required?: number;
      current?: number;
      refundedPoints?: number;
    };

/**
 * Vẽ một meme Chỉnh tay. Gửi kèm mã của lần bấm và nội dung cần lưu để máy chủ
 * tự lưu vào thư viện trước khi trả lời; đóng tab giữa chừng vẫn có ảnh.
 */
export async function drawMeme(
  params: ImageGenMemeParams,
  requestId: string,
  save: {
    original_idea: string;
    generated_content: MemeContent;
    selected_characters: SelectedCharacter[];
    has_watermark: boolean;
  },
): Promise<DrawMemeResult> {
  let response: Response;
  try {
    response = await fetch("/api/ai/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, request_id: requestId, save }),
    });
  } catch {
    return { ok: false, network: true, error: "Mất kết nối giữa chừng. Bạn bấm Thử lại nhé, không bị trừ điểm hai lần." };
  }
  const data = await response.json().catch(() => null);
  if (!data) {
    return response.ok
      ? { ok: false, network: true, error: "Mất kết nối giữa chừng. Bạn bấm Thử lại nhé, không bị trừ điểm hai lần." }
      : { ok: false, network: false, error: "Chưa vẽ được. Bạn thử lại nhé." };
  }
  if (!response.ok) {
    return {
      ok: false,
      network: false,
      error: typeof data.error === "string" ? data.error : "Chưa vẽ được. Bạn thử lại nhé.",
      code: typeof data.code === "string" ? data.code : undefined,
      required: typeof data.required === "number" ? data.required : undefined,
      current: typeof data.current === "number" ? data.current : undefined,
      refundedPoints: typeof data.refundedPoints === "number" ? data.refundedPoints : undefined,
    };
  }
  return {
    ok: true,
    image: typeof data.image === "string" ? data.image : "",
    imageUrl: typeof data.image_url === "string" ? data.image_url : null,
    memeId: typeof data.meme_id === "string" ? data.meme_id : null,
    requestId: typeof data.generation_request_id === "string" ? data.generation_request_id : null,
    pointsUsed: typeof data.pointsUsed === "number" ? data.pointsUsed : 0,
    droppedReferences: Array.isArray(data.reference_manifest?.dropped) ? data.reference_manifest.dropped.length : 0,
  };
}
