"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { stripImageMetadataFromFile } from "@/lib/image-metadata";
import {
  drawCost,
  isInsufficientPoints,
  isLocked,
  needsDrawing,
  PACK_VIEW_LABEL,
  planDraw,
  type DrawMode,
  type PackCharacter,
  type PackStatus,
} from "./character-pack";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly payload: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error || "Chưa làm được. Bạn thử lại nhé.", payload);
  return payload;
}

export type PackWork = { id: string; message: string };
export type PackFailure = { id: string; message: string };
export type PointsNeeded = { required: number; current: number; retry: () => void };

/**
 * Bộ ảnh nhân vật của một kênh: tải trạng thái, vẽ, chốt, dùng ảnh của bạn.
 *
 * Vẽ là một vòng gọi API trong trình duyệt, nhưng từng ảnh được máy chủ lưu
 * vào kho trước khi trả lời (route film-setup). Đóng tab giữa chừng chỉ dừng
 * vòng lặp; lần sau `planDraw` bỏ qua góc đã có nên không trả tiền hai lần.
 */
export function useCharacterPack(ref: string) {
  const base = `/api/projects/${ref}`;
  const [status, setStatus] = useState<PackStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  /** Kênh sai id hoặc đã mất quyền: trang gọi notFound() thay vì báo lỗi. */
  const [missing, setMissing] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const [work, setWork] = useState<PackWork | null>(null);
  const [failure, setFailure] = useState<PackFailure | null>(null);
  const [pointsNeeded, setPointsNeeded] = useState<PointsNeeded | null>(null);
  // Hai cú bấm trong cùng một khung hình đều thấy `work` còn trống; ref chặn
  // vòng vẽ thứ hai, nếu không mỗi góc bị vẽ và trừ điểm hai lần.
  const drawing = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(`${base}/film-setup`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 404) setMissing(true);
    if (!response.ok) throw new Error(payload.error || "Chưa mở được nhân vật của kênh. Bạn thử lại nhé.");
    setStatus(payload as PackStatus);
    setLoadError("");
    return payload as PackStatus;
  }, [base]);

  const refreshPoints = useCallback(async () => {
    try {
      const response = await fetch(`${base}/wallet`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setPoints(Number(payload.points || 0));
    } catch {
      // Chỉ để hiện "kênh còn …"; thiếu số này vẫn vẽ được.
    }
  }, [base]);

  /** Tải lại và giữ lỗi để trang hiện khung báo lỗi; trả null khi hỏng. */
  const reload = useCallback(
    () =>
      load().catch((cause) => {
        setLoadError((cause as Error).message);
        return null;
      }),
    [load],
  );

  useEffect(() => {
    void refreshPoints();
  }, [refreshPoints]);

  /** Lỗi hết điểm thì mở hộp nạp; lỗi khác thì trả về để nơi gọi hiện. */
  const handleSpendError = useCallback(
    (cause: unknown, required: number, retry: () => void) => {
      if (cause instanceof ApiError && isInsufficientPoints(cause.payload)) {
        setPointsNeeded({ required, current: points ?? 0, retry });
        void refreshPoints();
        return true;
      }
      return false;
    },
    [points, refreshPoints],
  );

  const draw = useCallback(
    async (character: PackCharacter, mode: DrawMode): Promise<boolean> => {
      if (!status || drawing.current) return false;
      drawing.current = true;
      setFailure(null);
      const say = (message: string) => setWork({ id: character.id, message });
      const plan = planDraw(character, mode);
      const remaining = drawCost(character, mode, status.pointsPerImage);
      try {
        if (plan.origin) {
          say(`Đang vẽ ${character.name}…`);
          await postJson(`${base}/film-setup`, { workspaceVersion: status.workspaceVersion, action: "origin", characterId: character.id });
        }
        let facePath = plan.facePath;
        for (const view of plan.views) {
          say(`Đang vẽ ảnh ${PACK_VIEW_LABEL[view].toLowerCase()} của ${character.name}…`);
          try {
            const made = await postJson(`${base}/film-setup`, {
              workspaceVersion: status.workspaceVersion,
              action: "generate",
              characterId: character.id,
              view,
              facePath: facePath || undefined,
            });
            if (view === "face") facePath = made.path;
          } catch (cause) {
            // Ảnh sau lưng chỉ là thêm: thiếu nó vẫn chốt được cận mặt + toàn thân.
            if (view !== "back") throw cause;
          }
        }
        await load();
        return true;
      } catch (cause) {
        const fresh = await load().catch(() => null);
        const latest = fresh?.characters.find((item) => item.id === character.id) ?? character;
        // Thử lại là vẽ tiếp: góc đã lưu không vẽ lại.
        const retry = () => void draw(latest, "continue");
        if (!handleSpendError(cause, remaining, retry)) {
          setFailure({ id: character.id, message: (cause as Error).message });
        }
        return false;
      } finally {
        drawing.current = false;
        setWork(null);
        void refreshPoints();
      }
    },
    [status, base, load, handleSpendError, refreshPoints],
  );

  const drawAll = useCallback(async () => {
    for (const character of status?.characters || []) {
      if (!needsDrawing(character)) continue;
      // Dừng ở nhân vật hỏng đầu tiên: hết điểm thì các nhân vật sau cũng hỏng.
      if (!(await draw(character, "continue"))) return;
    }
  }, [status, draw]);

  /** Chốt bộ ảnh: từ đây meme, video và phim gắn nhân vật này lấy đúng bộ ảnh này làm mẫu. */
  const approve = useCallback(
    async (character: PackCharacter) => {
      if (!status) return;
      setFailure(null);
      setWork({ id: character.id, message: `Đang chốt bộ ảnh của ${character.name}…` });
      try {
        const paths = Object.fromEntries(Object.entries(character.drafts || {}).map(([view, draft]) => [view, draft!.path]));
        await postJson(`${base}/film-setup`, { workspaceVersion: status.workspaceVersion, action: "lock", characterId: character.id, paths });
        const locked = new Set([
          ...status.characters.filter(isLocked).map((item) => item.id),
          ...(status.profile?.roles || []).map((role) => role.characterId),
          character.id,
        ]);
        // Chỉ gửi dàn nhân vật: máy chủ tự lấy hồ sơ từ kênh. Gửi câu mặc định
        // ở đây thì giờ nó bị ghi đè vào hồ sơ thật của kênh.
        await postJson(`${base}/channel-profile`, {
          characterIds: [...locked].filter((id) => status.characters.some((item) => item.id === id)),
        }).catch(() => undefined);
        await load();
      } catch (cause) {
        setFailure({ id: character.id, message: (cause as Error).message });
      } finally {
        setWork(null);
      }
    },
    [status, base, load],
  );

  /** Ảnh của bạn thành ảnh đại diện, rồi vẽ các góc theo ảnh đó. */
  const upload = useCallback(
    async (character: PackCharacter, file: File) => {
      if (!status) return;
      setFailure(null);
      setWork({ id: character.id, message: "Đang thêm ảnh…" });
      try {
        if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Chọn ảnh PNG, JPG hoặc WEBP nhé.");
        if (file.size > 10 * 1024 * 1024) throw new Error("Ảnh lớn quá 10 MB.");
        const supabase = createClient();
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${status.projectId}/${character.id}/${Date.now()}.${ext}`;
        // Kho ảnh nhân vật công khai: gỡ GPS và dấu vết máy chụp trước khi đưa lên.
        const clean = await stripImageMetadataFromFile(file);
        const { error: uploadError } = await supabase.storage.from("character-poses").upload(path, clean, { contentType: file.type });
        if (uploadError) throw new Error("Chưa thêm được ảnh. Bạn thử lại nhé.");
        const url = supabase.storage.from("character-poses").getPublicUrl(path).data.publicUrl;
        const { error: poseError } = await supabase
          .from("character_poses")
          .insert({ character_id: character.id, name: "Ảnh của bạn", emotion: "neutral", image_url: url });
        if (poseError) throw new Error("Chưa lưu được ảnh. Bạn thử lại nhé.");
        await supabase.from("characters").update({ avatar_url: url }).eq("id", character.id);
        const fresh = await load();
        const updated = fresh.characters.find((item) => item.id === character.id);
        setWork(null);
        if (updated) await draw(updated, "fromImage");
      } catch (cause) {
        setFailure({ id: character.id, message: (cause as Error).message });
      } finally {
        setWork(null);
      }
    },
    [status, load, draw],
  );

  return {
    status,
    loadError,
    missing,
    load,
    reload,
    points,
    refreshPoints,
    work,
    failure,
    setFailure,
    pointsNeeded,
    setPointsNeeded,
    draw,
    drawAll,
    approve,
    upload,
  };
}
