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
