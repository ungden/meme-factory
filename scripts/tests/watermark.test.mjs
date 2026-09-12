import { test } from "vitest";
import assert from "node:assert/strict";
import { watermarkFilters, applyVideoWatermark } from "../short-film/watermark.mjs";

test("all nine positions map both axes and constrain large/square logos", () => {
  for (const pos of ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"]) {
    const filters = watermarkFilters({ watermark_position: pos, watermark_opacity: 0.7 }, 1280, 720);
    const x = pos.includes("left") ? "24" : pos.includes("right") ? "W-w-24" : "(W-w)/2";
    const y = pos.includes("top") ? "24" : pos.includes("bottom") ? "H-h-24" : "(H-h)/2";
    assert.ok(filters[0].includes("scale=307:115:force_original_aspect_ratio=decrease"));
    assert.ok(filters[0].includes("aa=0.7"));
    assert.ok(filters[1].includes(`overlay=${x}:${y}`));
  }
});
test("old jobs without an image watermark keep their original video", async () => {
  assert.equal(await applyVideoWatermark("old.mp4", undefined, "unused"), "old.mp4");
  assert.equal(await applyVideoWatermark("old.mp4", { watermark_url: null }, "unused"), "old.mp4");
});
