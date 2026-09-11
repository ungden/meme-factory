/** Structured visual direction keeps Seedance acting concrete instead of adjective-only. */
export const PERFORMANCE_LANES = [
  "deadpan_reversal",
  "adult_format_parody",
  "literal_logic",
  "physical_escalation",
  "cinematic_cool",
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
const hasConcreteVerb = (value: string) =>
  /\b(?:bật|kéo|giật|đập|chộp|rút|đẩy|ném|đặt|mở|đóng|chặn|chỉ|quay|ngoái|lùi|tiến|nhảy|trượt|đứng|ngồi|đi|chạy|đưa|giơ|lấy|bẻ|giấu|đo|đếm|gõ|hất|né|khựng|đổi|trao|cúi|ngẩng|liếc|nhìn|há|mím|phồng|nhăn|nhướng|sững|đơ|thở|nuốt|rụt|vẫy|bước|khoanh|vỗ|dí|kẹp|chồm|xoay|nghiêng|bật ngửa|hất cằm|nheo|mở to|siết|buông)\b/iu.test(
    value,
  );

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
  if (!hasConcreteVerb(d.hook))
    issues.push({ field: "hook", reason: "Hook phải là hành động nhìn thấy trong giây đầu." });
  if (d.beats.filter((b) => hasConcreteVerb(b.physicalAction)).length < 2)
    issues.push({ field: "beats", reason: "Cần ít nhất hai hành động vật lý cụ thể." });
  if (d.beats.every((b) => GENERIC_ONLY.test(`${b.expressionChange} ${b.gesture}`)))
    issues.push({ field: "beats", reason: "Không thể dùng toàn nhãn cảm xúc chung chung." });
  if (d.statusBefore.trim() === d.statusAfter.trim())
    issues.push({ field: "status", reason: "Phải có thay đổi quyền chủ động hoặc trạng thái." });
  if (d.beats.some((b) => GENERIC_ONLY.test(b.reactionTarget) || b.reactionTarget.trim().length < 4))
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
        concreteActionCount: d.beats.filter((b) => hasConcreteVerb(b.physicalAction)).length,
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
  if (issues.length)
    throw new Error(`PERFORMANCE_DIRECTION_WEAK: ${issues.map((i) => i.field).join(",")}`);
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
  }[d.lane];
  return [
    `PERFORMANCE: lane=${lane}; mục tiêu hài=${d.comicObjective}; trạng thái trước=${d.statusBefore}; sau=${d.statusAfter}.`,
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
