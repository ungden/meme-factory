import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atempoArguments,
  speechTempoDecision,
} from "../short-film/speech-pace.mjs";

test("keeps an already concise short-form line unchanged", () => {
  assert.deepEqual(speechTempoDecision(3.2, 3), {
    tempo: 1,
    expectedSeconds: 3.2,
    status: "natural",
    withinTarget: true,
  });
});

test("normalizes a slow line without changing provider or cutting audio", () => {
  const result = speechTempoDecision(4.64, 1.4);
  assert.equal(result.tempo, 1.25);
  assert.equal(result.expectedSeconds, 4.64 / 1.25);
  assert.equal(result.status, "normalized");
  assert.equal(result.withinTarget, false);
});

test("uses a bounded atempo filter and canonical short-film WAV output", () => {
  assert.deepEqual(atempoArguments("raw.wav", "line.wav", 1.2), [
    "-i",
    "raw.wav",
    "-vn",
    "-filter:a",
    "atempo=1.2000",
    "-ar",
    "24000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    "line.wav",
  ]);
  assert.throws(() => atempoArguments("raw.wav", "line.wav", 1.3));
});

test("gives a very short line absolute slack after normalization", () => {
  const decision = speechTempoDecision(2.16, 1.21);
  assert.equal(decision.tempo, 1.25);
  assert.equal(decision.withinTarget, true);
  assert.equal(speechTempoDecision(8, 4).withinTarget, false);
});

test("không chặn một lượt chạy vì câu ngắn lệch vài phần trăm giây", () => {
  // Số đo thật từ lượt chạy ngày 18/09: "Khi nào chị cho phép." — mục tiêu
  // 1,97 giây, đọc ra 3,32 giây, sau khi tăng tốc còn 2,637.
  const decision = speechTempoDecision(3.32, 1.97);
  assert.equal(decision.tempo, 1.25);
  assert.equal(decision.withinTarget, true);
});

test("vẫn chặn câu dài gấp đôi nhịp cho phép", () => {
  // Số đo thật từ lượt trước đó: câu 30 từ, mục tiêu 11,58 giây, đọc ra 26,16.
  assert.equal(speechTempoDecision(26.16, 11.58).withinTarget, false);
});
