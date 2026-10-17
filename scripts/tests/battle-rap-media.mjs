import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { ffmpeg, probe } from "../short-film/media.mjs";
import { assDocument, normalizeClip, renderBattle } from "../battle-rap/media.mjs";
const exec = promisify(execFile);

test("ASS safely displays Vietnamese lyrics and cannot inject styling commands", () => {
  const ass = assDocument({ title: "Đỏ đấu Xanh", cues: [{ start: 0.2, end: 1, speaker: "A", text: "Chào {\\pos(0,0)} sân khấu" }], names: { A: "Đỏ" }, duration: 2 });
  assert.ok(ass.includes("Đỏ đấu Xanh"));
  assert.ok(!ass.includes("{\\pos"));
  assert.ok(ass.includes("Đỏ: Chào"));
});

test("ffmpeg assembles clips with readable title/lyrics and only the master soundtrack", { timeout: 90000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "battle-media-test-"));
  try {
    const source = path.join(dir, "source.mp4"), audio = path.join(dir, "master.wav"), first = path.join(dir, "first.mp4"), second = path.join(dir, "second.mp4");
    await ffmpeg(["-f", "lavfi", "-i", "color=c=0x101010:s=180x320:r=30:d=1.3", "-f", "lavfi", "-i", "sine=frequency=100:duration=1.3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
    await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=880:duration=2.4", audio]);
    await normalizeClip(source, first, 1.2, "9:16");
    await normalizeClip(source, second, 1.2, "9:16");
    assert.equal((await probe(first)).audio, false);
    const result = await renderBattle({ clips: [first, second], audio, cues: [{ start: 0.2, end: 1.1, text: "Đỏ ra sân rồi", speaker: "A" }, { start: 1.3, end: 2.3, text: "Xanh đáp trả ngay", speaker: "B" }], title: "Đỏ đấu Xanh", names: { A: "Đỏ", B: "Xanh" }, duration: 2.4, format: "9:16", dir });
    const final = await probe(result.output);
    assert.ok(final.video && final.audio);
    assert.ok(Math.abs(final.duration - 2.4) < 0.15);
    const pcm = path.join(dir, "audio.pcm");
    await ffmpeg(["-i", result.output, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-f", "s16le", pcm]);
    const bytes = await readFile(pcm);
    let crossings = 0, prior = 0;
    for (let i = 3200; i < Math.min(bytes.length, 32000); i += 2) {
      const sample = bytes.readInt16LE(i);
      if (sample > 0 && prior <= 0) crossings++;
      prior = sample;
    }
    assert.ok(crossings > 650 && crossings < 900, `Expected 880Hz master, got ${crossings} crossings`);
    const frame = await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", result.output, "-frames:v", "1", "-vf", "scale=180:320", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { encoding: "buffer", maxBuffer: 1024 ** 2 });
    assert.ok([...frame.stdout].filter(pixel => pixel > 150).length > 100, "Expected visible text over the dark test frame");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
