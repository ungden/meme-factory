import { describe, expect, it } from "vitest";
import { checkTechnicalTask, visualEvidencePath, withoutLipIssues } from "./automatic-qa";
import type { FilmTask } from "./contracts";

function task(
  kind: FilmTask["kind"],
  result: Record<string, unknown>,
): FilmTask {
  return {
    id: crypto.randomUUID(),
    kind,
    scene_id: null,
    scene_version: null,
    plan_version: 1,
    status: "completed",
    input: {},
    result,
    error: null,
    approved_at: null,
    created_at: new Date().toISOString(),
  };
}

describe("automatic short-film evidence checks", () => {
  it("accepts a real timed transcript only under the speech threshold", () => {
    expect(
      checkTechnicalTask(
        task("transcribe", {
          speechError: 0.1,
          segments: [{ start: 0, end: 1, text: "Xin chào" }],
        }),
      ).status,
    ).toBe("passed");
    expect(
      checkTechnicalTask(task("transcribe", { speechError: 0.4, segments: [] }))
        .status,
    ).toBe("needs_review");
  });

  it("allows minor Vietnamese ASR homophones for a voice-locked dubbed track", () => {
    const dubbed = task("transcribe", {
      speechError: 0.24,
      segments: [{ start: 0, end: 1, text: "Còn đêm đến ba" }],
    });
    dubbed.input = { audioMode: "dubbed", dialogue: "Con đếm đến ba" };
    expect(checkTechnicalTask(dubbed).status).toBe("passed");
  });

  // Whisper từng trả "Hãy subscribe cho kênh…" dài 30 giây cho clip 8 giây mở
  // bằng nhịp không lời; bản lồng tiếng giữ lịch TTS và chờ người nghe lại.
  it("asks for a listen when ASR could not read a dubbed clip", () => {
    const dubbed = task("transcribe", {
      asrIssue: "Timestamp ASR không hợp lệ.",
      transcriptSource: "locked_tts_schedule",
      speechError: 1,
      segments: [{ start: 3.2, end: 5, text: "Bố chạy nhanh lên" }],
    });
    dubbed.input = { audioMode: "dubbed", dialogue: "Bố chạy nhanh lên" };
    const check = checkTechnicalTask(dubbed);
    expect(check.status).toBe("needs_review");
    expect(check.issues[0]).toContain("nghe lại");
  });

  // Người dùng: video phải nói đủ câu, nhưng khẩu hình không khớp thì không
  // được chặn hay bắt tạo lại.
  it("never blocks a clip only for lip movement", () => {
    const lipOnly = withoutLipIssues({
      status: "needs_review",
      issues: ["Khẩu hình Đậu Đỏ không khớp lời thoại", "Người nghe mấp máy môi"],
      evidence: { requirementResults: [{ status: "passed" }] },
    });
    expect(lipOnly.status).toBe("passed");
    expect(lipOnly.evidence.lipNotes).toHaveLength(2);
    const realProblem = withoutLipIssues({
      status: "failed",
      issues: ["Môi lệch nhịp", "Đậu Đỏ đi giày trắng thay vì chân trần"],
      evidence: {},
    });
    expect(realProblem.status).toBe("failed");
    expect(realProblem.issues).toEqual(["Đậu Đỏ đi giày trắng thay vì chân trần"]);
    const action = withoutLipIssues({ status: "needs_review", issues: ["Không thấy Đậu Đỏ chu môi thổi vào mắt Bố"], evidence: {} });
    expect(action.status).toBe("needs_review");
    expect(withoutLipIssues({ status: "needs_review", issues: ["Miệng Bố không khớp lời thoại"], evidence: {} }).status).toBe("passed");
  });

  it("requires every final artifact and actual audio/video evidence", () => {
    expect(
      checkTechnicalTask(
        task("render", {
          path: "p.mp4",
          poster: "p.jpg",
          srt: "p.srt",
          duration: 31,
          video: true,
          audio: true,
        }),
      ).status,
    ).toBe("passed");
    expect(
      checkTechnicalTask(
        task("render", {
          path: "p.mp4",
          duration: 31,
          video: true,
          audio: false,
        }),
      ).status,
    ).toBe("failed");
  });

  it("never accepts a visual provider response without visual review", () => {
    expect(checkTechnicalTask(task("image", { path: "p.png" })).status).toBe(
      "needs_review",
    );
  });

  it("stops a managed voice line that is still too slow before video purchase", () => {
    const tts = task("tts", {
      duration: 3.71,
      originalDuration: 4.64,
      audio: true,
      paceTargetSeconds: 1.4,
      paceTempoApplied: 1.25,
      paceWithinTarget: false,
    });
    tts.input = { pacePolicyVersion: "short-form-dialogue-2026-09-14" };
    expect(checkTechnicalTask(tts)).toMatchObject({
      status: "needs_review",
      evidence: { paceTempoApplied: 1.25 },
    });
  });

  it("checks moving media through its lightweight full-duration proxy", () => {
    expect(
      visualEvidencePath(
        task("video", {
          path: "master.mp4",
          qaPreviewPath: "qa-preview.mp4",
        }),
      ),
    ).toBe("qa-preview.mp4");
    expect(
      visualEvidencePath(task("image", { path: "first-frame.png" })),
    ).toBe("first-frame.png");
  });
});
