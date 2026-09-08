import { test } from "node:test";
import assert from "node:assert/strict";
import { speechRange, shiftTranscript } from "../short-film/edit-range.mjs";
const segments = [
  { start: 1, end: 2, text: "Xin chào" },
  { start: 3, end: 4, text: "Cả nhà" },
];
test("keeps full clip by default, including acting pauses", () =>
  assert.deepEqual(speechRange(6, segments, false), {
    inSeconds: 0,
    outSeconds: 6,
  }));
test("uses actual timing with margins and preserves internal pause", () =>
  assert.deepEqual(speechRange(6, segments, true), {
    inSeconds: 0.8,
    outSeconds: 4.5,
  }));
test("subtitle offsets follow edited clips", () =>
  assert.equal(
    shiftTranscript(segments, { inSeconds: 0.8, outSeconds: 4.5 }, 7)[1].end,
    10.2,
  ));
test("cannot cut speech or invent timing", () => {
  assert.throws(() => speechRange(6, [], true));
  assert.throws(() => speechRange(3, segments, true));
  assert.throws(() =>
    shiftTranscript(segments, { inSeconds: 1.5, outSeconds: 5 }, 0),
  );
});
