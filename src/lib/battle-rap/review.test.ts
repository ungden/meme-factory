import { describe, expect, it } from "vitest";
import { makeBlocks, type BattleRun, type ReviewStage } from "./contracts";
import { applyReviewAction, attemptKey, eligibleAssetKeys, gate, initReview, recordVariant, stageReferenceIds } from "./review";
import { briefFixture, cuesFixture, input, shotsFixture } from "./test-fixtures";

function fixture(stage: ReviewStage = "lyrics"): BattleRun {
  const run: BattleRun = {
    id: "run", project_id: "project", created_by: "actor", workspace_version: 1,
    input, status: "awaiting_review", phase: "references", budget_points: 600, points_used: 20, refunded_points: 0,
    error: null, lease_owner: null, lease_expires_at: null, created_at: "", updated_at: "",
    state: { review: { ...initReview(), stage, revision: 3 }, brief: briefFixture(),
      music: { path: "project/master.m4a", duration: 18 }, rawTiming: "original", cues: cuesFixture(),
      blocks: makeBlocks(18, input.videoModel, []), storyboard: { shots: shotsFixture() },
      references: [{ id: "stage", prompt: "original", dependsOn: [] }], images: {}, clipFiles: {}, clips: {}, excerpts: { "block-1": "project/excerpt.m4a" } },
  };
  for (const id of ["cast-A", "cast-B", "cast-MC", "cast-DJ", "stage", "scene-block-1", "scene-block-2"]) recordVariant(run.state, `image:${id}`, `project/${id}.png`);
  for (const id of ["block-1", "block-2"]) recordVariant(run.state, `video:${id}`, `project/${id}.mp4`);
  return run;
}

function act(run: BattleRun, body: Record<string, unknown>) {
  return applyReviewAction(run, { revision: run.state.review!.revision, ...body });
}

describe("battle rap staged review", () => {
  it("keeps legacy step names and state untouched", () => {
    const state = { images: { "cast-A": "original" } };
    expect(attemptKey(state, "image:cast-A")).toBe("image:cast-A");
    recordVariant(state, "image:cast-A", "new");
    expect(state).toEqual({ images: { "cast-A": "original" } });
    const run = fixture(); delete run.state.review;
    expect(() => applyReviewAction(run, { action: "approveStage", revision: 0 })).toThrow(/chưa tới bước/);
  });

  it("enters a gate without mutating the run and only changes its revision on entry", () => {
    const run = fixture("cast"); run.status = "running";
    const state = gate(run, "cast");
    expect(state.review!.revision).toBe(4);
    expect(run.state.review!.revision).toBe(3);
    expect(gate({ ...run, state, status: "awaiting_review" }, "cast").review!.revision).toBe(4);
    expect(gate({ ...run, state, status: "awaiting_review" }, "stage").review).toMatchObject({ revision: 5, stage: "stage" });
  });

  it("rejects stale clicks, actions during generation, and already approved stages", () => {
    const run = fixture();
    expect(() => act(run, { action: "approveStage", revision: 2 })).toThrow(/vừa được cập nhật/);
    expect(() => act({ ...run, status: "running" }, { action: "approveStage" })).toThrow(/chưa tới bước/);
    run.state.review!.approved.push("lyrics");
    expect(() => act(run, { action: "regenerateText", target: "brief" })).toThrow(/đã được chốt/);
  });

  it.each([
    ["lyrics", "music"], ["music", "timing"], ["storyboard", "references"], ["cast", "references"],
    ["stage", "references"], ["scenes", "excerpts"], ["clips", "render"],
  ] as const)("approval of %s advances only to %s", (stage, phase) => {
    const run = fixture(stage), result = act(run, { action: "approveStage" });
    expect(result).toMatchObject({ phase, status: "queued", state: { review: { revision: 4, approved: [stage] } } });
    expect(run.state.review!.approved).toEqual([]);
  });

  it("lets the chosen lyrics proceed to a manual music upload", () => {
    expect(act(fixture(), { action: "approveStage", musicMode: "upload" })).toMatchObject({ phase: "music", status: "awaiting_music", state: { review: { musicMode: "upload" } } });
    expect(act(fixture(), { action: "approveStage" }).state.review!.musicMode).toBe("auto");
    expect(() => act(fixture(), { action: "approveStage", musicMode: "anything" })).toThrow(/Cách nhận/);
  });

  it.each(["lyrics", "music", "storyboard", "cast", "stage", "scenes", "clips"] as const)("refuses incomplete %s approval", stage => {
    const run = fixture(stage);
    if (stage === "lyrics") delete run.state.brief;
    else if (stage === "music") run.state.music!.duration = 0;
    else if (stage === "storyboard") run.state.storyboard!.shots = [];
    else if (stage === "clips") delete run.state.clipFiles!["block-2"];
    else delete run.state.images![stageReferenceIds(run.state, stage)[0]];
    expect(() => act(run, { action: "approveStage" })).toThrow(/Cần đủ/);
  });

  it("regenerates one character while preserving all other chosen assets and prior variants", () => {
    const run = fixture("cast"), original = structuredClone(run);
    const result = act(run, { action: "regenerateAsset", assetKey: "image:cast-B", feedback: "  Áo xanh đậm hơn  " });
    expect(result).toMatchObject({ phase: "references", status: "queued" });
    expect(result.state.images!["cast-B"]).toBeUndefined();
    expect(result.state.images!["cast-A"]).toBe(run.state.images!["cast-A"]);
    expect(result.state.images!.stage).toBe(run.state.images!.stage);
    expect(result.state.clipFiles).toEqual(run.state.clipFiles);
    expect(result.state.review!.variants["image:cast-B"]).toEqual(run.state.review!.variants["image:cast-B"]);
    expect(result.state.review!.selected["image:cast-B"]).toBeUndefined();
    expect(result.state.review!.notes["image:cast-B"]).toBe("Áo xanh đậm hơn");
    expect(attemptKey(result.state, "image:cast-B")).toBe("image:cast-B:v1");
    expect(attemptKey(result.state, "image:cast-A")).toBe("image:cast-A");
    expect(run).toEqual(original);
  });

  it("records the new persisted variant once and allows choosing the old one", () => {
    const run = fixture("cast");
    const changed = act(run, { action: "regenerateAsset", assetKey: "image:cast-A", feedback: "Sáng hơn" });
    recordVariant(changed.state, "image:cast-A", "project/brighter.png");
    recordVariant(changed.state, "image:cast-A", "project/brighter.png");
    expect(changed.state.review!.variants["image:cast-A"]).toHaveLength(2);
    expect(changed.state.review!.variants["image:cast-A"][1]).toMatchObject({ id: "image:cast-A:v1", note: "Sáng hơn" });
    expect(changed.state.images!["cast-A"]).toBe("project/brighter.png");
    const picked = act({ ...run, state: gate({ ...run, ...changed }, "cast") }, { action: "selectVariant", assetKey: "image:cast-A", variantId: "image:cast-A" });
    expect(picked.state.images!["cast-A"]).toBe("project/cast-A.png");
    expect(picked.state.review!.selected["image:cast-A"]).toBe("image:cast-A");
    expect(picked.status).toBe("awaiting_review");
  });

  it("regenerates only one scene with prior character and stage choices retained", () => {
    const run = fixture("scenes");
    run.state.review!.approved = ["lyrics", "music", "storyboard", "cast", "stage"];
    const result = act(run, { action: "regenerateAsset", assetKey: "image:scene-block-1" });
    expect(result.state.images!["scene-block-1"]).toBeUndefined();
    expect(result.state.images!["scene-block-2"]).toBe("project/scene-block-2.png");
    expect(result.state.images!["cast-A"]).toBe("project/cast-A.png");
    expect(result.state.review!.approved).toEqual(run.state.review!.approved);
    expect(() => act(run, { action: "regenerateAsset", assetKey: "image:cast-A" })).toThrow(/bước hiện tại/);
  });

  it("regenerates a single clip, preserving its audio excerpt and neighboring clips", () => {
    const run = fixture("clips"), result = act(run, { action: "regenerateAsset", assetKey: "video:block-1", feedback: "Máy quay đứng yên" });
    expect(result).toMatchObject({ phase: "video", status: "queued" });
    expect(result.state.clips!["block-1"]).toBeUndefined();
    expect(result.state.clipFiles!["block-1"]).toBeUndefined();
    expect(result.state.clipFiles!["block-2"]).toBe("project/block-2.mp4");
    expect(result.state.excerpts).toEqual(run.state.excerpts);
    recordVariant(result.state, "video:block-1", "project/steady.mp4");
    const picked = act({ ...run, state: gate({ ...run, ...result }, "clips") }, { action: "selectVariant", assetKey: "video:block-1", variantId: "video:block-1" });
    expect(picked.state.clipFiles!["block-1"]).toBe("project/block-1.mp4");
    expect(picked.state.clips!["block-1"]).toBe("project/block-1.mp4");
  });

  it("rejects variants from other assets and changes to a different review stage", () => {
    const run = fixture("cast");
    expect(() => act(run, { action: "selectVariant", assetKey: "image:cast-A", variantId: "image:cast-B" })).toThrow(/Không tìm thấy/);
    expect(() => act(run, { action: "selectVariant", assetKey: "image:stage", variantId: "image:stage" })).toThrow(/bước hiện tại/);
    expect(() => act(run, { action: "regenerateText", target: "brief" })).toThrow(/đang chọn/);
    expect(() => act(run, { action: "replaceMusic" })).toThrow(/chọn nhạc/);
  });

  it("bounds revision feedback and repeated paid attempts", () => {
    const run = fixture("cast");
    expect(() => act(run, { action: "regenerateAsset", assetKey: "image:cast-A", feedback: "x".repeat(1601) })).toThrow(/1.600/);
    run.state.review!.attempts["image:cast-A"] = 20;
    expect(() => act(run, { action: "regenerateAsset", assetKey: "image:cast-A" })).toThrow(/20 lần/);
    expect(run.state.images!["cast-A"]).toBe("project/cast-A.png");
  });

  it("creates new text step keys while preserving the previous draft for contextual edits", () => {
    const lyrics = act(fixture(), { action: "regenerateText", target: "brief", feedback: "Đối đáp sắc hơn" });
    expect(lyrics.phase).toBe("writing");
    expect(lyrics.state.brief).toEqual(briefFixture());
    expect(attemptKey(lyrics.state, "brief")).toBe("brief:v1");
    const run = fixture("storyboard"), storyboard = act(run, { action: "regenerateText", target: "storyboard" });
    expect(storyboard.phase).toBe("storyboard");
    expect(storyboard.state.storyboard).toEqual(run.state.storyboard);
    expect(storyboard.state.references).toEqual(run.state.references);
    expect(storyboard.state.brief).toEqual(run.state.brief);
    expect(storyboard.state.music).toEqual(run.state.music);
    expect(attemptKey(storyboard.state, "storyboard")).toBe("storyboard:v1");
  });

  it("replaces the master at the music gate without discarding approved lyrics", () => {
    const run = fixture("music"); run.state.review!.approved = ["lyrics"];
    const result = act(run, { action: "replaceMusic" });
    expect(result).toMatchObject({ phase: "music", status: "awaiting_music", state: { review: { stage: "music", approved: ["lyrics"], revision: 4, musicMode: "upload" } } });
    expect(result.state.brief).toEqual(run.state.brief);
    for (const key of ["music", "rawTiming", "cues", "blocks"] as const) expect(result.state[key]).toBeUndefined();
    expect(run.state.music).toBeDefined();
  });

  it("derives eligible files from the real song blocks", () => {
    const run = fixture();
    expect(stageReferenceIds(run.state, "cast")).toEqual(["cast-A", "cast-B", "cast-MC", "cast-DJ"]);
    expect(eligibleAssetKeys(run.state, "scenes")).toEqual(["image:scene-block-1", "image:scene-block-2"]);
    expect(eligibleAssetKeys(run.state, "clips")).toEqual(["video:block-1", "video:block-2"]);
    expect(eligibleAssetKeys(run.state, "music")).toEqual([]);
    run.state.blocks = [];
    expect(() => act({ ...run, state: { ...run.state, review: { ...run.state.review!, stage: "clips" } } }, { action: "approveStage" })).toThrow(/Cần đủ/);
  });
});
