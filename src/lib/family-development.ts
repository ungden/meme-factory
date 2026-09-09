import type { Story, FamilyEditorialIssue } from "./family-catalogue";

export const FAMILY_BENCHMARK_VERSION = "family-editorial-4";
/** User rejected these assistant-written demos; they are negative anchors, not templates. */
export const FAMILY_EDITORIAL_BENCHMARK = `MẪU ĐỐI CHIẾU ${FAMILY_BENCHMARK_VERSION}:
REF người dùng thích — phỏng vấn xe đồ chơi: mở nhận ra phỏng vấn chủ xe sang; tiếp xúc khách sáo, giới thiệu nghề, hỏi cụ thể và nói về người em lần lượt lộ cách nhân vật nhìn mình và tận dụng việc nhỏ trong gia đình. Không chỉ gọi đồ chơi bằng tên sang. Giữ thái độ thật với vai, câu hỏi dẫn có tác dụng. Học cách phát triển, không chép chuỗi hỏi/đáp.
REF người dùng thích — bố mẹ nhờ mua đồ: hai bé đang đi thì bị gọi lại; mẹ dặn khẩu vị, bố chen nhu cầu khác, trẻ phản ứng, bố tìm cách nài nỉ. Mỗi người làm việc riêng của mình nhưng tác động lên nhau. Chi tiết khẩu vị, chen lời và thái độ làm quan hệ sống; không cần ai giải thích đang đảo vai.
BA DEMO NGƯỜI DÙNG ĐÃ LOẠI (không được xem là bản đạt):
1. Bố không muốn đi làm: sếp mắng → ngại gặp sếp → nhờ con đi cùng. Chỉ kéo dài một ý bố mè nheo; hai bé thay nhau hỏi, kết chị còn gọi mẹ chỉ thêm việc. Đúng đảo vai vẫn nhạt.
2. Review buffet tủ lạnh: bánh của mẹ, sữa của bố → vậy ăn được gì → một cái rồi nửa cái. Mất hành vi người review, trở về xin đồ ăn; trò chia bánh không phát triển parody.
3. Phỏng vấn sau trận: bé kể bố đang thắng thì cho hết giờ → mẹ chưa nấu xong → bố nhắc vẫn hai–một. Kể lại chuyện thay tương tác, người hỏi chỉ chuyển thông tin, kết nhắc điều đã biết.
KIỂM TRA TRÁNH TỰ KHEN: Một tour nhà gối chỉ lần lượt đổi gối thành vật liệu nhập khẩu, bánh quy thành kho năng lượng, trùm chăn thành bảo mật vẫn có thể rất nhạt. MC hỏi tiện ích/an ninh, chủ nhà liệt kê, rồi thực hiện đúng tính năng vừa báo trước: không phải tự nhiên đã có diễn biến thú vị. Trích hai câu đặt tên hoa mỹ chưa chứng minh chất lượng. Cần thấy quan sát riêng về con người, cách đáp làm thay đổi cách hiểu hoặc tương tác, nét đời thường khiến vai diễn sống. Phỏng vấn được phép kể nhưng cách kể phải bộc lộ nhân vật, không chỉ kể thông tin.
LỖI ĐIỂM DỪNG NGƯỜI DÙNG VỪA LOẠI: hai bé đã nói sẽ tự đi học và mẹ đang ngái ngủ chấp nhận — phép đảo vai đã hạ. Viết thêm việc hai bé không biết đường hoặc chỉ biết tên trường mở một vấn đề mới nhưng không phát triển/giải quyết nó. Đó là đuôi thừa, không phải kết chớt quớt hay cú chốt. Kết chớt quớt được phép khi câu cuối làm cái vô lý hoặc quan hệ vừa đủ rõ; không cần kết có hậu, giải quyết hậu quả, thêm bài học hay thêm một trò đùa nữa.
LỖI NGÔI NÓI VỪA BẮT Ở CANARY: Đậu Đỏ nói với chị “Thôi hai đứa tự đi...” nghe như người lớn đang nói về hai bé khác. Trong quan hệ thật, em nói “chị em mình/tụi mình tự đi”; nói với bố mẹ mới là “tụi con”. Bản đúng ý và đúng điểm dừng vẫn không đạt nếu đại từ làm lộ giọng tác giả hoặc giọng dịch.
Đừng biến các bản yếu thành danh sách cấm chủ đề. Cùng chủ đề có thể viết tốt bằng hành vi, quan hệ và cách phát triển khác. Không đổi vài danh từ trong các demo này rồi coi là phương án mới. So chất lượng diễn biến với ref và điểm yếu với demo, không chấm chỉ theo tên cơ chế. Không hứa điểm hài/retention bằng con số.`;

export type PremiseCandidate = {
  id: string;
  situation: string;
  familiarPattern: string;
  observedBehavior: string;
  progression: string[];
  stopPoint: string;
  risk: string;
  sampleExchange: Story["dialogue"];
};
export type PremiseSelection = {
  selectedId: string | null;
  reason: string;
  evaluations: {
    candidateId: string;
    decision: "develop" | "reject";
    strongestDetail: string;
    weakness: string;
    reason: string;
  }[];
};
export type Watchability = {
  decision: "ready_for_user" | "revise" | "reject";
  reason: string;
  weakness: string;
  formatOnly: boolean;
  weakestMoment: { line: number; quote: string; why: string };
  moments: {
    line: number;
    kind: "dialogue" | "action";
    quote: string;
    why: string;
  }[];
};
export type EditorialReview = {
  passed: boolean;
  evidence: Record<string, string>;
  issues: FamilyEditorialIssue[];
  endingCheck: {
    status: "clean_stop" | "forced_tail" | "unfinished";
    lastNecessaryLine: number;
    quote: string;
    reason: string;
  };
  speechCheck: {
    status: "natural" | "needs_revision";
    line: number;
    quote: string;
    reason: string;
  };
  watchability: Watchability;
};
export type FamilyDevelopmentTrace = {
  benchmarkVersion: string;
  stage: "premises" | "selection" | "draft" | "review" | "shots" | "complete";
  candidates: PremiseCandidate[];
  validationFailures?: { stage: string; error: string; response: unknown }[];
  selection?: PremiseSelection;
  drafts: {
    dialogue: Story["dialogue"];
    setup: string;
    payoff: string;
    endingPlan?: Story["endingPlan"];
    review?: EditorialReview;
  }[];
};
const string = { type: "string" };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const editorialEvidenceKeys = [
  "contrast",
  "motivation",
  "development",
  "ending",
  "originality",
];
export function premiseSchema(ids: string[]) {
  return object({
    candidates: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: object({
        id: { type: "string", enum: ["A", "B", "C"] },
        situation: string,
        familiarPattern: string,
        observedBehavior: string,
        progression: { type: "array", minItems: 2, maxItems: 4, items: string },
        stopPoint: string,
        risk: string,
        sampleExchange: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: object({
            characterId: { type: "string", enum: ids },
            text: string,
            action: string,
          }),
        },
      }),
    },
  });
}
export const selectionSchema = object({
  selectedId: { type: ["string", "null"], enum: ["A", "B", "C", null] },
  reason: string,
  evaluations: {
    type: "array",
    minItems: 3,
    maxItems: 3,
    items: object({
      candidateId: { type: "string", enum: ["A", "B", "C"] },
      decision: { type: "string", enum: ["develop", "reject"] },
      strongestDetail: string,
      weakness: string,
      reason: string,
    }),
  },
});
export const editorialReviewSchema = object({
  evidence: object(
    Object.fromEntries(editorialEvidenceKeys.map((k) => [k, string])),
  ),
  issues: {
    type: "array",
    maxItems: 12,
    items: object({ location: string, quote: string, reason: string }),
  },
  endingCheck: object({
    status: {
      type: "string",
      enum: ["clean_stop", "forced_tail", "unfinished"],
    },
    lastNecessaryLine: { type: "integer", minimum: 1 },
    quote: string,
    reason: string,
  }),
  speechCheck: object({
    status: { type: "string", enum: ["natural", "needs_revision"] },
    line: { type: "integer", minimum: 1 },
    quote: string,
    reason: string,
  }),
  watchability: object({
    decision: { type: "string", enum: ["ready_for_user", "revise", "reject"] },
    reason: string,
    weakness: string,
    formatOnly: { type: "boolean" },
    weakestMoment: object({
      line: { type: "integer", minimum: 1 },
      quote: string,
      why: string,
    }),
    moments: {
      type: "array",
      maxItems: 5,
      items: object({
        line: { type: "integer", minimum: 1 },
        kind: { type: "string", enum: ["dialogue", "action"] },
        quote: string,
        why: string,
      }),
    },
  }),
});
const hasText = (v: unknown, min = 8, max = 1400): v is string =>
  typeof v === "string" && v.trim().length >= min && v.length <= max;
const normalized = (s: string) =>
  s
    .normalize("NFC")
    .toLocaleLowerCase("vi")
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim();
// A reviewer may separate literal excerpts with a slash or ellipsis. Every part must exist;
// this accepts a citation list, never a paraphrase or an invented combined sentence.
function groundedQuote(quote: string, sources: string[]) {
  if (sources.some((s) => s.includes(quote))) return true;
  const parts = quote
    .split(/\s+\/\s+|\.{3}|…/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    parts.length > 1 &&
    parts.length <= 4 &&
    parts.every(
      (p) => p.trim().length >= 2 && sources.some((s) => s.includes(p.trim())),
    )
  );
}
export function validatePremises(
  value: unknown,
  ids: string[],
): PremiseCandidate[] {
  const c = (value as { candidates?: PremiseCandidate[] })?.candidates;
  if (
    !Array.isArray(c) ||
    c.length !== 3 ||
    new Set(c.map((p) => p?.id)).size !== 3 ||
    c.some(
      (p) =>
        !p ||
        !["A", "B", "C"].includes(p.id) ||
        ![
          p.situation,
          p.familiarPattern,
          p.observedBehavior,
          p.stopPoint,
          p.risk,
        ].every((v) => hasText(v)) ||
        !Array.isArray(p.progression) ||
        p.progression.length < 2 ||
        p.progression.length > 4 ||
        !p.progression.every((v) => hasText(v)) ||
        !Array.isArray(p.sampleExchange) ||
        p.sampleExchange.length < 2 ||
        p.sampleExchange.length > 4 ||
        p.sampleExchange.some(
          (d) =>
            !d ||
            !ids.includes(d.characterId) ||
            !hasText(d.text, 2, 300) ||
            !hasText(d.action, 3, 400),
        ),
    )
  )
    throw new Error("FAMILY_PREMISES_INVALID");
  if (
    new Set(c.map((p) => normalized(p.situation))).size !== 3 ||
    new Set(c.map((p) => normalized(p.progression.join(" ")))).size !== 3
  )
    throw new Error("FAMILY_PREMISES_DUPLICATED");
  return c;
}
export function validateSelection(
  value: unknown,
  candidates: PremiseCandidate[],
): PremiseSelection {
  const s = value as PremiseSelection;
  if (
    !s ||
    !hasText(s.reason) ||
    !Array.isArray(s.evaluations) ||
    s.evaluations.length !== 3 ||
    new Set(s.evaluations.map((e) => e?.candidateId)).size !== 3 ||
    s.evaluations.some((e) => {
      const c = candidates.find((c) => c.id === e?.candidateId);
      const details = c
        ? [
            c.observedBehavior,
            ...c.progression,
            c.stopPoint,
            ...c.sampleExchange.flatMap((d) => [
              d.text,
              d.action,
              `${d.text} (${d.action})`,
            ]),
          ]
        : [];
      return (
        !c ||
        !["develop", "reject"].includes(e.decision) ||
        ![e.strongestDetail, e.weakness, e.reason].every((v) => hasText(v)) ||
        !groundedQuote(e.strongestDetail, details)
      );
    }) ||
    (s.selectedId !== null &&
      !s.evaluations.some(
        (e) => e.candidateId === s.selectedId && e.decision === "develop",
      ))
  )
    throw new Error("FAMILY_SELECTION_INVALID");
  return s;
}
export function validateEditorialReview(
  value: unknown,
  story: Story,
): EditorialReview {
  const r = value as EditorialReview;
  if (
    !r ||
    !editorialEvidenceKeys.every((k) => hasText(r.evidence?.[k], 11)) ||
    !Array.isArray(r.issues) ||
    r.issues.length > 12 ||
    r.issues.some(
      (i) =>
        !i ||
        ![i.location, i.quote, i.reason].every((v) => hasText(v, 1)) ||
        !groundedQuote(i.quote, [
          story.setup,
          story.payoff,
          ...story.beats.map((b) => b.description),
          ...story.dialogue.flatMap((d) => [
            d.text,
            d.action,
            `${d.text} (${d.action})`,
          ]),
        ]),
    )
  )
    throw new Error("FAMILY_EDITORIAL_REVIEW_INVALID");
  const w = r.watchability;
  const ending = r.endingCheck;
  const speech = r.speechCheck;
  if (
    !ending ||
    !["clean_stop", "forced_tail", "unfinished"].includes(ending.status) ||
    !Number.isInteger(ending.lastNecessaryLine) ||
    !story.dialogue[ending.lastNecessaryLine - 1] ||
    !hasText(ending.quote, 2) ||
    !hasText(ending.reason, 15) ||
    ![
      story.dialogue[ending.lastNecessaryLine - 1].text,
      story.dialogue[ending.lastNecessaryLine - 1].action,
    ].some((text) => text.includes(ending.quote)) ||
    !speech ||
    !["natural", "needs_revision"].includes(speech.status) ||
    !Number.isInteger(speech.line) ||
    !story.dialogue[speech.line - 1] ||
    !hasText(speech.quote, 2) ||
    !hasText(speech.reason, 15) ||
    ![
      story.dialogue[speech.line - 1].text,
      story.dialogue[speech.line - 1].action,
    ].some((text) => text.includes(speech.quote)) ||
    !w ||
    !["ready_for_user", "revise", "reject"].includes(w.decision) ||
    !hasText(w.reason, 15) ||
    !hasText(w.weakness) ||
    typeof w.formatOnly !== "boolean" ||
    !Number.isInteger(w.weakestMoment?.line) ||
    !hasText(w.weakestMoment?.quote, 2) ||
    !hasText(w.weakestMoment?.why, 15) ||
    !story.dialogue[w.weakestMoment.line - 1] ||
    ![
      story.dialogue[w.weakestMoment.line - 1].text,
      story.dialogue[w.weakestMoment.line - 1].action,
    ].some((t) => t.includes(w.weakestMoment.quote)) ||
    !Array.isArray(w.moments) ||
    w.moments.length > 5 ||
    w.moments.some((m) => {
      const d = story.dialogue[m?.line - 1];
      return (
        !Number.isInteger(m?.line) ||
        !d ||
        !["dialogue", "action"].includes(m.kind) ||
        !hasText(m.quote, 2) ||
        !hasText(m.why, 15) ||
        !(m.kind === "dialogue" ? d.text : d.action).includes(m.quote)
      );
    }) ||
    (w.decision === "ready_for_user" &&
      new Set(w.moments.map((m) => m.line)).size < 2)
  )
    throw new Error("FAMILY_EDITORIAL_REVIEW_INVALID");
  const endingIsClean =
    ending.status === "clean_stop" &&
    ending.lastNecessaryLine === story.dialogue.length;
  const speechIsNatural = speech.status === "natural";
  const decision = w.formatOnly
    ? "reject"
    : (!endingIsClean || !speechIsNatural) && w.decision === "ready_for_user"
      ? "revise"
      : w.decision;
  return {
    ...r,
    watchability: { ...w, decision },
    passed:
      endingIsClean &&
      speechIsNatural &&
      !w.formatOnly &&
      r.issues.length === 0 &&
      decision === "ready_for_user",
  };
}
