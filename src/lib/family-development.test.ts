import { it, expect } from "vitest";
import {
  validatePremises,
  validateSelection,
  validateEditorialReview,
} from "./family-development";
import type { Story } from "./family-catalogue";
const story: Story = {
  profileVersion: 6,
  series: "Hai con lo hết",
  situation: "Hai bé kiểm đồ của bố trước giờ đi làm",
  mechanism: "Đảo vai chăm sóc trong gia đình",
  outcome: "Bố còn phải được nhắc đi giày",
  wants: [],
  caption: "Một buổi sáng trước cửa nhà",
  beats: [],
  setup: "Hai bé kiểm tra đồ của bố",
  payoff: "Bố vẫn chưa đi giày",
  dialogue: [
    {
      characterId: "a",
      text: "Bố đã mang đủ đồ chưa?",
      action: "Chỉ vào túi đồ của bố",
    },
    {
      characterId: "b",
      text: "Bố còn để bình nước ở đây này.",
      action: "Nhấc bình nước lên trước cửa",
    },
  ],
};
const evidence = Object.fromEntries(
  ["contrast", "motivation", "development", "ending", "originality"].map(
    (k) => [k, "Một chi tiết cụ thể trong đoạn được đánh giá"],
  ),
);
const review = {
  passed: true,
  evidence,
  issues: [],
  endingCheck: {
    status: "clean_stop",
    lastNecessaryLine: story.dialogue.length,
    quote: story.dialogue.at(-1)!.text,
    reason: "Lượt cuối hạ việc kiểm đồ đang diễn mà không mở thêm vấn đề mới.",
  },
  speechCheck: {
    status: "natural",
    line: 1,
    quote: story.dialogue[0].text,
    reason: "Người nói dùng cách xưng hô phù hợp với người nghe trong cảnh.",
  },
  intentCheck: {
    status: "faithful",
    evidence: story.dialogue.at(-1)!.text,
    reason:
      "Bản diễn giữ tình huống kiểm đồ và đi tới đúng việc bố còn quên đồ.",
  },
  watchability: {
    decision: "ready_for_user",
    formatOnly: false,
    weakestMoment: {
      line: 1,
      quote: story.dialogue[0].text,
      why: "Câu hỏi đầu vẫn chung chung, cần thao tác cụ thể để có sắc thái",
    },
    reason: "Hai câu liên quan tới việc mang đồ và việc bị bỏ sót",
    weakness: "Nhịp nói vẫn cần được nghe thử trước khi dùng",
    moments: story.dialogue.map((d, i) => ({
      line: i + 1,
      kind: "dialogue",
      quote: d.text,
      why: "Đoạn này khiến người kia phải kiểm tra lại đồ cụ thể",
    })),
  },
};
it("does not equate no errors or passed=true with editorial acceptance", () => {
  const r = validateEditorialReview(
    {
      ...review,
      watchability: { ...review.watchability, decision: "reject", moments: [] },
    },
    story,
  );
  expect(r.passed).toBe(false);
  expect(r.issues).toEqual([]);
});
it.each([
  { ...review, watchability: undefined },
  {
    ...review,
    watchability: {
      ...review.watchability,
      moments: [review.watchability.moments[0], review.watchability.moments[0]],
    },
  },
  {
    ...review,
    watchability: {
      ...review.watchability,
      moments: [
        review.watchability.moments[0],
        {
          ...review.watchability.moments[1],
          quote: "câu chưa từng có trong bản chữ",
        },
      ],
    },
  },
  {
    ...review,
    watchability: {
      ...review.watchability,
      moments: [
        review.watchability.moments[0],
        { ...review.watchability.moments[1], line: 99 },
      ],
    },
  },
  {
    ...review,
    issues: [
      {
        location: "dialogue.1",
        quote: "một lỗi được bịa ra",
        reason: "không tự nhiên",
      },
    ],
  },
])("refuses invented, duplicated or missing quality evidence", (r) =>
  expect(() => validateEditorialReview(r, story)).toThrow(
    "FAMILY_EDITORIAL_REVIEW_INVALID",
  ),
);
it("grounds visible acting evidence separately from spoken text", () => {
  const r = {
    ...review,
    watchability: {
      ...review.watchability,
      moments: story.dialogue.map((d, i) => ({
        line: i + 1,
        kind: "action",
        quote: d.action,
        why: "Đạo cụ và cử chỉ này làm rõ việc bố cần hai con chăm lo",
      })),
    },
  };
  expect(validateEditorialReview(r, story).passed).toBe(true);
});
it("cannot pass when the story omits an explicit requested outcome", () => {
  const r = validateEditorialReview(
    {
      ...review,
      intentCheck: {
        status: "needs_revision",
        evidence: story.dialogue[0].text,
        reason:
          "Bản diễn mới bắt đầu kiểm đồ nhưng chưa thực hiện kết thúc đã được yêu cầu.",
      },
    },
    story,
  );
  expect(r.passed).toBe(false);
  expect(r.watchability.decision).toBe("revise");
});
const candidates = ["A", "B", "C"].map((id, i) => ({
  id,
  situation: [
    "Bố quên mang đồ đi làm",
    "Mẹ xin xem phim thêm chút",
    "Hai bé phỏng vấn chủ xe",
  ][i],
  familiarPattern: "Một vai trò quen thuộc của người lớn",
  observedBehavior: "Bố mẹ đợi con kiểm lại đồ trước cửa",
  progression: [
    "Một hành vi cụ thể thứ " + i,
    "Người kia đáp lại và làm thay đổi việc đang diễn",
  ],
  stopPoint: "Người lớn lại nhờ hai bé thêm một việc",
  risk: "Có thể nhạt nếu chỉ liệt kê các việc phải làm",
  sampleExchange: story.dialogue,
}));
const selection = {
  selectedId: "B",
  reason: "Phương án B có cách phát triển hơn các phương án khác",
  evaluations: candidates.map((c) => ({
    candidateId: c.id,
    decision: c.id === "B" ? "develop" : "reject",
    strongestDetail: c.observedBehavior,
    weakness: c.risk,
    reason: "Đã đối chiếu hành vi và mẫu đối đáp trong tình huống này",
  })),
};
it("validates exact distinct alternatives and selected cast", () => {
  expect(validatePremises({ candidates }, ["a", "b"])).toHaveLength(3);
  expect(() =>
    validatePremises(
      { candidates: [candidates[0], candidates[0], candidates[2]] },
      ["a", "b"],
    ),
  ).toThrow("FAMILY_PREMISES_INVALID");
  expect(() => validatePremises({ candidates }, ["a"])).toThrow(
    "FAMILY_PREMISES_INVALID",
  );
  expect(() =>
    validatePremises(
      {
        candidates: candidates.map((c) => ({
          ...c,
          situation: candidates[0].situation,
        })),
      },
      ["a", "b"],
    ),
  ).toThrow("FAMILY_PREMISES_DUPLICATED");
});
it("cannot select a rejected or nonexistent premise, or invent its evidence", () => {
  expect(validateSelection(selection, candidates).selectedId).toBe("B");
  for (const bad of ["A", "missing"])
    expect(() =>
      validateSelection({ ...selection, selectedId: bad }, candidates),
    ).toThrow("FAMILY_SELECTION_INVALID");
  expect(() =>
    validateSelection(
      {
        ...selection,
        evaluations: selection.evaluations.map((e) => ({
          ...e,
          strongestDetail: "Chi tiết không nằm trong bất kỳ phương án nào",
        })),
      },
      candidates,
    ),
  ).toThrow("FAMILY_SELECTION_INVALID");
  expect(
    validateSelection({ ...selection, selectedId: null }, candidates)
      .selectedId,
  ).toBeNull();
});

it("rejects format-only praise despite passed=true and grounded compliments", () => {
  expect(
    validateEditorialReview(
      { ...review, watchability: { ...review.watchability, formatOnly: true } },
      story,
    ).passed,
  ).toBe(false);
});
it("requires the counterargument to cite a real line", () => {
  expect(() =>
    validateEditorialReview(
      {
        ...review,
        watchability: {
          ...review.watchability,
          weakestMoment: {
            line: 99,
            quote: "Bịa một chi tiết",
            why: "Một nhận xét nhưng không có trong kịch bản",
          },
        },
      },
      story,
    ),
  ).toThrow("FAMILY_EDITORIAL_REVIEW_INVALID");
});

it("accepts a list of literal excerpts but rejects one invented part", () => {
  const issue = {
    location: "dialogue",
    quote: story.dialogue.map((d) => d.text).join(" / "),
    reason: "Những câu này chưa có chi tiết đủ khác nhau",
  };
  expect(
    validateEditorialReview(
      { ...review, passed: false, issues: [issue] },
      story,
    ).passed,
  ).toBe(false);
  expect(() =>
    validateEditorialReview(
      {
        ...review,
        issues: [
          { ...issue, quote: issue.quote + " / Một câu hoàn toàn bịa ra" },
        ],
      },
      story,
    ),
  ).toThrow("FAMILY_EDITORIAL_REVIEW_INVALID");
  const evaluated = {
    ...selection,
    evaluations: selection.evaluations.map((e) => ({
      ...e,
      strongestDetail: `${story.dialogue[0].text} (${story.dialogue[0].action})`,
    })),
  };
  expect(validateSelection(evaluated, candidates).selectedId).toBe("B");
});

it("grounds ellipsis-separated excerpts without permitting paraphrases", () => {
  const r = {
    ...review,
    passed: false,
    issues: [
      {
        location: "dialogue",
        quote: "Bố đã mang đủ đồ...Bố còn để bình nước",
        reason: "Hai câu dẫn chưa có sự phát triển rõ về phản ứng",
      },
    ],
  };
  expect(validateEditorialReview(r, story).passed).toBe(false);
  expect(() =>
    validateEditorialReview(
      {
        ...r,
        issues: [
          { ...r.issues[0], quote: r.issues[0].quote + "...một câu bịa thêm" },
        ],
      },
      story,
    ),
  ).toThrow("FAMILY_EDITORIAL_REVIEW_INVALID");
});

it("grounds intent evidence that cites multiple quoted lines", () => {
  const result = validateEditorialReview(
    {
      ...review,
      intentCheck: {
        status: "faithful",
        evidence:
          "Bánh Bao hỏi về ‘Bố đã mang đủ đồ chưa?’, còn Đậu Đỏ nhắc ‘Bố còn để bình nước ở đây này.’",
        reason:
          "Hai lượt thoại đều giữ đúng chi tiết người dùng yêu cầu trong tình huống.",
      },
    },
    story,
  );
  expect(result.passed).toBe(true);
  expect(() =>
    validateEditorialReview(
      {
        ...review,
        intentCheck: {
          status: "faithful",
          evidence:
            "Bánh Bao hỏi về ‘Bố đã mang đủ đồ chưa?’, còn Đậu Đỏ nhắc ‘một câu bịa thêm’.",
          reason:
            "Một phần trích dẫn không xuất hiện trong bản diễn và phải bị từ chối.",
        },
      },
      story,
    ),
  ).toThrow("FAMILY_EDITORIAL_REVIEW_INVALID");
});

it("derives acceptance from the editorial verdict, not a second contradictory flag", () => {
  expect(
    validateEditorialReview({ ...review, passed: false }, story).passed,
  ).toBe(true);
});

it("downgrades a claimed ready script when the reviewer finds a forced tail", () => {
  const result = validateEditorialReview(
    {
      ...review,
      endingCheck: {
        status: "forced_tail",
        lastNecessaryLine: 1,
        quote: story.dialogue[0].text,
        reason:
          "Lượt thứ hai mở thêm việc bình nước sau khi điểm dừng đã nằm ở lượt đầu.",
      },
    },
    story,
  );
  expect(result.passed).toBe(false);
  expect(result.watchability.decision).toBe("revise");
});

it("requires the stopping-point evidence to quote the claimed line", () => {
  expect(() =>
    validateEditorialReview(
      {
        ...review,
        endingCheck: {
          ...review.endingCheck,
          quote: "Một câu không tồn tại trong kịch bản",
        },
      },
      story,
    ),
  ).toThrow("FAMILY_EDITORIAL_REVIEW_INVALID");
});

it("requires revision when a line uses an unnatural speaker viewpoint", () => {
  const result = validateEditorialReview(
    {
      ...review,
      speechCheck: {
        status: "needs_revision",
        line: 2,
        quote: story.dialogue[1].text,
        reason:
          "Câu thoại dùng đại từ như người ngoài kể thay vì đúng góc nhìn nhân vật.",
      },
    },
    story,
  );
  expect(result.passed).toBe(false);
  expect(result.watchability.decision).toBe("revise");
});
