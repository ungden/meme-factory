/** Structured visual direction keeps Seedance acting concrete instead of adjective-only. */
export const PERFORMANCE_LANES = [
  "deadpan_reversal",
  "adult_format_parody",
  "literal_logic",
  "physical_escalation",
  "cinematic_cool",
  "cinematic_emotion",
] as const;
export type PerformanceLane = (typeof PERFORMANCE_LANES)[number];

export type PerformanceBeat = {
  physicalAction: string;
  expressionChange: string;
  gesture: string;
  propInteraction?: string;
  reactionTarget: string;
  cameraMove: string;
};

export type PerformanceDirection = {
  version: 1;
  lane: PerformanceLane;
  comicObjective: string;
  statusBefore: string;
  statusAfter: string;
  hook: string;
  beats: PerformanceBeat[];
  revealOrCut: string;
};

const GENERIC_ONLY = /^(?:tự nhiên|nghiêm túc|ngây thơ|đáng yêu|vui vẻ|gật đầu|mỉm cười|nhìn ngơ ngác|camera đẹp|diễn xuất rõ)[.!;,:\s]*$/iu;
// JavaScript's `\b` only understands ASCII word characters. It misses common
// Vietnamese verbs ending in diacritics (for example "chỉ" and "gỡ"), which
// made valid directions fail before any paid generation.
const hasConcreteVerb = (value: string) =>
  /(?:^|[\s,.;:!?()])(?:bật|kéo|giật|đập|chộp|rút|đẩy|ném|đặt|mở|đóng|chặn|chỉ|quay|ngoái|lùi|tiến|nhảy|trượt|đứng|ngồi|đi|chạy|đưa|giơ|lấy|bẻ|giấu|đo|đếm|gõ|hất|né|khựng|đổi|trao|cúi|ngẩng|liếc|nhìn|há|mím|phồng|nhăn|nhướng|sững|đơ|thở|nuốt|rụt|vẫy|bước|khoanh|vỗ|dí|kẹp|chồm|xoay|nghiêng|bật ngửa|hất cằm|nheo|mở to|siết|buông|gỡ|ôm|cầm|nắm|ghi|viết|lật|thổi|lau|xoa|vuốt|cắt|xắn|cắn|ăn|uống|rót|múc|gắp|nhặt|cất|bỏ|treo|gấp|mặc|cởi|đội|đeo|lắc|xua|gật|ngước|nhún|gãi|hôn|thơm|cười|khóc|dựa|tựa|nằm|quỳ|rướn|với|chạm|sờ|ấn|bấm|vặn|xếp|dọn|quét|rửa|đỡ|bế|nhón|nép|núp|trốn|huých|kiễng|chống|vung|lăn|thả|nhấc|nâng|ngó|dò|soi|quét mắt|cõng|bế|bồng|địu|dắt|ẵm|nhấc bổng|bế bổng|thổi|chu môi|dụi|lau|vuốt ve|xoa đầu|thơm má)(?=$|[\s,.;:!?()])/iu.test(
    value,
  );

// Danh sách động từ không bao giờ đủ ("vươn hai tay" từng bị chặn cả lượt dựng
// storyboard). Câu tả bộ phận cơ thể đang làm gì cũng là hành động nhìn thấy
// được; nhãn cảm xúc chung chung thì không nhắc tới bộ phận nào.
const BODY_PART =
  /(?:^|[\s,.;:!?()])(?:tay|bàn tay|ngón tay|cánh tay|chân|bàn chân|đầu|mắt|mặt|má|môi|miệng|vai|lưng|cổ|ngực|bụng|người|thân|trán|mũi|tóc|cằm|gối|đùi|hông|eo)(?=$|[\s,.;:!?()])/iu;
// "Đậu Đỏ nhận dép" từng bị chặn vì "nhận" không có trong danh sách. Một câu
// có chủ ngữ, động từ và đối tượng (từ ba từ) cũng là hành động nhìn thấy
// được, miễn không chỉ là nhãn cảm xúc chung chung.
const FEELING_ONLY =
  /^(?:(?:rất|hơi|vô cùng|thật)\s+)?(?:xúc động|hạnh phúc|buồn bã|buồn|vui vẻ|vui|tự nhiên|nghiêm túc|ngây thơ|đáng yêu|cảm động|ấm áp|bối rối|ngạc nhiên)(?:\s+(?:và|,)\s+.*)?[.!]?$/iu;
const hasVisibleCue = (value: string) => {
  const text = value.normalize("NFC").trim();
  return hasConcreteVerb(text) || BODY_PART.test(text);
};
// Chỉ beat hành động dùng luật "chủ ngữ + động từ + đối tượng"; hook vẫn phải
// có động từ hoặc bộ phận cơ thể, để câu tả cảm xúc dài không lọt qua.
const hasConcreteAction = (value: string) => {
  const text = value.normalize("NFC").trim();
  return (
    hasVisibleCue(text) ||
    (text.split(/\s+/).length >= 3 && !GENERIC_ONLY.test(text) && !FEELING_ONLY.test(text))
  );
};

export type PerformanceIssue = { field: string; reason: string };

export type PerformanceCheck = {
  status: "passed" | "needs_review";
  issues: PerformanceIssue[];
  evidence: {
    lane?: PerformanceLane;
    hook?: string;
    beatCount?: number;
    concreteActionCount?: number;
    hasStateChange?: boolean;
    hasTargetedReaction?: boolean;
    revealOrCut?: string;
  };
};

export function validatePerformanceDirection(
  value: unknown,
): PerformanceDirection {
  const d = value as PerformanceDirection;
  if (
    !d ||
    d.version !== 1 ||
    !PERFORMANCE_LANES.includes(d.lane) ||
    ![d.comicObjective, d.statusBefore, d.statusAfter, d.hook, d.revealOrCut].every(
      (v) => typeof v === "string" && v.trim().length >= 4,
    ) ||
    !Array.isArray(d.beats) ||
    d.beats.length < 2 ||
    d.beats.length > 6 ||
    d.beats.some(
      (b) =>
        !b ||
        ![b.physicalAction, b.expressionChange, b.gesture, b.reactionTarget, b.cameraMove].every(
          (v) => typeof v === "string" && v.trim().length >= 2,
        ) ||
        (b.propInteraction !== undefined && typeof b.propInteraction !== "string"),
    )
  )
    throw new Error("PERFORMANCE_DIRECTION_INVALID");
  return d;
}

/** Static guard used before a paid provider request. */
export function lintPerformanceDirection(
  direction: PerformanceDirection,
): PerformanceIssue[] {
  const d = validatePerformanceDirection(direction);
  const issues: PerformanceIssue[] = [];
  if (!hasVisibleCue(d.hook))
    issues.push({ field: "hook", reason: "Hook phải là hành động nhìn thấy trong giây đầu." });
  if (d.beats.filter((b) => hasConcreteAction(b.physicalAction)).length < 2)
    issues.push({ field: "beats", reason: "Cần ít nhất hai hành động vật lý cụ thể." });
  if (d.beats.every((b) => GENERIC_ONLY.test(`${b.expressionChange} ${b.gesture}`)))
    issues.push({ field: "beats", reason: "Không thể dùng toàn nhãn cảm xúc chung chung." });
  if (d.statusBefore.trim() === d.statusAfter.trim())
    issues.push({ field: "status", reason: "Phải có thay đổi quyền chủ động hoặc trạng thái." });
  // "Mẹ", "Bố" là người cụ thể; chỉ chặn nhãn chung chung hoặc gần như rỗng.
  if (d.beats.some((b) => GENERIC_ONLY.test(b.reactionTarget) || b.reactionTarget.trim().length < 2))
    issues.push({ field: "reactionTarget", reason: "Phản ứng phải hướng vào người hoặc đạo cụ cụ thể." });
  if (!hasConcreteVerb(d.revealOrCut) && !/hard.?cut|cắt|giữ|khựng|lộ|bật mí/iu.test(d.revealOrCut))
    issues.push({ field: "revealOrCut", reason: "Cần điểm lộ, phản ứng hoặc điểm cắt rõ." });
  return issues;
}

/** Non-throwing evidence used by QA and the UI before a paid request. */
export function performanceCheck(value: unknown): PerformanceCheck {
  try {
    const d = validatePerformanceDirection(value);
    const issues = lintPerformanceDirection(d);
    return {
      status: issues.length ? "needs_review" : "passed",
      issues,
      evidence: {
        lane: d.lane,
        hook: d.hook,
        beatCount: d.beats.length,
        concreteActionCount: d.beats.filter((b) => hasConcreteAction(b.physicalAction)).length,
        hasStateChange: d.statusBefore.trim() !== d.statusAfter.trim(),
        hasTargetedReaction: d.beats.every((b) => !GENERIC_ONLY.test(b.reactionTarget)),
        revealOrCut: d.revealOrCut,
      },
    };
  } catch (error) {
    return {
      status: "needs_review",
      issues: [{ field: "direction", reason: error instanceof Error ? error.message : "PERFORMANCE_DIRECTION_INVALID" }],
      evidence: {},
    };
  }
}

export function assertPerformanceDirection(direction: PerformanceDirection) {
  const issues = lintPerformanceDirection(direction);
  if (issues.length) {
    // Chỉ ghi tên trường thì model đang sửa phải đoán câu nào bị chê và thường
    // trượt lại đúng lỗi đó; kèm lý do và nguyên văn để lượt sửa nhắm trúng.
    const d = direction;
    const quoted: Record<string, string> = {
      hook: d.hook,
      revealOrCut: d.revealOrCut,
      status: `${d.statusBefore} → ${d.statusAfter}`,
      beats: d.beats.map((b) => b.physicalAction).join(" | "),
      reactionTarget: d.beats.map((b) => b.reactionTarget).join(" | "),
    };
    const details = issues
      .map((i) => `${i.field}: ${i.reason} Đang viết: "${String(quoted[i.field] ?? "").slice(0, 160)}"`)
      .join("; ");
    throw new Error(
      `PERFORMANCE_DIRECTION_WEAK: ${issues.map((i) => i.field).join(",")} — ${details}`.slice(0, 900),
    );
  }
  return direction;
}

export function compilePerformanceDirection(direction: PerformanceDirection) {
  const d = assertPerformanceDirection(direction);
  const lane = {
    deadpan_reversal: "tỉnh bơ rồi bẻ lái",
    adult_format_parody: "parody format người lớn",
    literal_logic: "luật vô lý được theo đuổi nhất quán",
    physical_escalation: "leo thang hình thể an toàn",
    cinematic_cool: "ngầu kiểu điện ảnh rồi bẻ bằng chi tiết trẻ con",
    cinematic_emotion: "cảm xúc điện ảnh tiết chế, có nguyên nhân",
  }[d.lane];
  return [
    `PERFORMANCE: lane=${lane}; mục tiêu diễn=${d.comicObjective}; trạng thái trước=${d.statusBefore}; sau=${d.statusAfter}.`,
    `HOOK 0–1s: ${d.hook}`,
    ...d.beats.map(
      (b, i) =>
        `BEAT ${i + 1}: hành động=${b.physicalAction}; nét mặt đổi=${b.expressionChange}; cử chỉ=${b.gesture}; ${b.propInteraction ? `đạo cụ=${b.propInteraction}; ` : ""}phản ứng hướng vào=${b.reactionTarget}; camera=${b.cameraMove}.`,
    ),
    `REVEAL/CUT: ${d.revealOrCut}`,
    "Diễn bằng hành vi nhìn thấy được, không cười giải thích trò đùa, không đứng tạo dáng hoặc lặp cùng một động tác.",
  ].join("\n");
}

export function mergePerformanceDirections(
  directions: (PerformanceDirection | null | undefined)[],
) {
  const valid = directions.filter(Boolean) as PerformanceDirection[];
  if (!valid.length) return undefined;
  const first = validatePerformanceDirection(valid[0]);
  if (valid.some((d) => validatePerformanceDirection(d).lane !== first.lane))
    throw new Error("PERFORMANCE_LANE_MIXED");
  return {
    ...first,
    beats: valid.flatMap((d) => validatePerformanceDirection(d).beats),
  } satisfies PerformanceDirection;
}
