export const MAX_SHORT_FORM_TEMPO = 1.25;
export const PACE_TOLERANCE = 1.12;
// Câu rất ngắn ("Bố sao vậy?", mục tiêu ~1,2 giây) nói tự nhiên vẫn dài hơn
// hai mươi phần trăm; tính thêm một khoảng dư tuyệt đối để không chặn nhầm.
//
// 0,9 giây chứ không phải 0,6: một lượt chạy thật đã bị đỗ vì câu "Khi nào chị
// cho phép." dài 2,637 giây so với trần 2,570 — lệch 67 mili-giây. Nhịp lấy hơi
// và điểm cắt đầu câu của bộ đọc chiếm một khoảng gần như cố định, nên với câu
// ngắn nó chiếm tỷ lệ rất lớn; chặn ở mức đó là chặn nhầm. Câu dài vẫn do nhánh
// tỷ lệ 1,2× quyết định, nên trần cho thoại dài không hề nới ra.
export const SHORT_LINE_SLACK_SECONDS = 0.9;

/**
 * Decide whether a generated voice line needs a bounded, pitch-preserving
 * tempo correction. This never calls a provider and never cuts speech.
 */
export function speechTempoDecision(actualSeconds, targetSeconds) {
  const actual = Number(actualSeconds);
  const target = Number(targetSeconds);
  if (!Number.isFinite(actual) || actual <= 0)
    throw new Error("INVALID_ACTUAL_SPEECH_DURATION");
  if (!Number.isFinite(target) || target <= 0)
    return {
      tempo: 1,
      expectedSeconds: actual,
      status: "unmanaged",
      withinTarget: true,
    };

  if (actual <= target * PACE_TOLERANCE)
    return {
      tempo: 1,
      expectedSeconds: actual,
      status: "natural",
      withinTarget: true,
    };

  // Keep a small amount of conversational air instead of forcing every line
  // to the exact heuristic target. The cap avoids audible tempo artifacts.
  const tempo = Math.min(
    MAX_SHORT_FORM_TEMPO,
    Math.max(1, actual / (target * 1.08)),
  );
  const expectedSeconds = actual / tempo;
  return {
    tempo: Math.round(tempo * 10000) / 10000,
    expectedSeconds,
    status: tempo > 1.001 ? "normalized" : "natural",
    withinTarget: expectedSeconds <= Math.max(target * 1.2, target + SHORT_LINE_SLACK_SECONDS),
  };
}

export function atempoArguments(input, output, tempo) {
  if (!Number.isFinite(tempo) || tempo < 1 || tempo > MAX_SHORT_FORM_TEMPO)
    throw new Error("INVALID_SHORT_FORM_TEMPO");
  return [
    "-i",
    input,
    "-vn",
    "-filter:a",
    `atempo=${tempo.toFixed(4)}`,
    "-ar",
    "24000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    output,
  ];
}
