import { describe, it, expect } from "vitest";
import {
  speechLines,
  speechDirection,
  speechTasks,
  dubbingSchedule,
  currentSceneTask,
  finalClipKind,
  filmVideoInputs,
  type FilmScene,
  type FilmTask,
} from "./contracts";
const scene = {
  id: "scene",
  version: 2,
  duration_seconds: 15,
  dialogue: "Em đi thôi. Dạ chị.",
  setting: "Sân trường",
  camera: "pan",
  action: "Đi học",
  motion_prompt: "Đeo cặp",
  cast_snapshot: [
    {
      characterId: "bao",
      name: "Bánh Bao",
      voice: {
        id: "v-bao",
        voice_id: "Aoede",
        model: "gemini-2.5-pro-preview-tts",
        settings: {},
      },
    },
    {
      characterId: "do",
      name: "Đậu Đỏ",
      voice: {
        id: "v-do",
        voice_id: "Charon",
        model: "gemini-2.5-pro-preview-tts",
        settings: {},
      },
    },
  ],
  storyboard: {
    version: 1,
    durationSeconds: 15,
    beats: [
      {
        startSeconds: 0,
        endSeconds: 7,
        speakerCharacterId: "bao",
        dialogue: "Em đi thôi.",
        action: "Đeo cặp",
        camera: "pan",
        motion: "Quay lại",
      },
      {
        startSeconds: 7,
        endSeconds: 15,
        speakerCharacterId: "do",
        dialogue: "Dạ chị.",
        action: "Gật",
        camera: "pan",
        motion: "Bước đi",
      },
    ],
  },
} as FilmScene;
const audios = (): FilmTask[] =>
  speechLines(scene).map(
    (l) =>
      ({
        id: `audio-${l.beatIndex}`,
        plan_version: 1, error: null, approved_at: null, created_at: new Date(0).toISOString(),
        scene_id: scene.id,
        scene_version: scene.version,
        status: "completed",
        kind: "tts",
        input: {
          beatIndex: l.beatIndex,
          speakerCharacterId: l.speakerCharacterId,
          voiceProfileVersion: l.voice.id,
          providerInputs: { text: l.dialogue, voice: l.voice.voice_id },
        },
        result: { duration: 2, audio: true },
      }) as FilmTask,
  );
describe("per-turn dubbing", () => {
  it("owns voice, text and task ID by speaker rather than cast order", () => {
    expect(
      dubbingSchedule(audios().reverse(), scene).map((x) => [
        x.speakerCharacterId,
        x.voice,
        x.audioTaskId,
      ]),
    ).toEqual([
      ["bao", "Aoede", "audio-0"],
      ["do", "Charon", "audio-1"],
    ]);
  });
  it("directs each approved voice from its own storyboard beat", () => {
    expect(speechDirection(scene, 0, "Giọng Bánh Bao.")).toContain(
      "Đeo cặp",
    );
    expect(speechDirection(scene, 1, "Giọng Đậu Đỏ.")).toContain(
      "Bước đi",
    );
    expect(speechDirection(scene, 1, "Giọng Đậu Đỏ.")).toContain(
      "Giọng Đậu Đỏ.",
    );
  });
  it("rejects swapped speakers, stale versions and unapproved voices", () => {
    const tasks = audios();
    tasks[0].input.speakerCharacterId = "do";
    expect(speechTasks(tasks, scene)[0]).toBeUndefined();
    expect(() => dubbingSchedule(tasks, scene)).toThrow("Thiếu audio");
    tasks[0] = audios()[0];
    tasks[0].scene_version = 1;
    expect(speechTasks(tasks, scene)[0]).toBeUndefined();
    const missing = {
      ...scene,
      cast_snapshot: scene.cast_snapshot.map((c) => ({
        ...c,
        voice: undefined,
      })),
    };
    expect(speechTasks(tasks, missing)).toEqual([undefined]);
    expect(() => speechLines(missing)).toThrow("Duyệt giọng");
  });
  it("borrows later scene time when a natural read crosses a storyboard beat", () => {
    const tasks = audios();
    tasks[0].result!.duration = 7;
    const schedule = dubbingSchedule(tasks, scene);
    expect(schedule[0].startSeconds).toBe(0);
    expect(schedule[1].startSeconds).toBe(7);
    expect(schedule[1].endSeconds).toBeLessThanOrEqual(scene.duration_seconds);
  });
  it("stops before buying video when measured speech exceeds the whole scene", () => {
    const tasks = audios();
    tasks[0].result!.duration = 14;
    expect(() => dubbingSchedule(tasks, scene)).toThrow("dài hơn toàn cảnh");
  });
  it("requests silent 15s I2V and keeps 16:9 storyboard direction", () => {
    const input = filmVideoInputs(scene, "dubbed", "16:9", "720p", "frame");
    expect(input.generate_audio).toBe(false);
    expect(input.duration).toBe(15);
    expect(input.prompt).toContain("16:9");
    expect(input.prompt).toContain("SILENT VIDEO");
    expect(input.prompt).toContain("Bánh Bao");
    expect(input.prompt).toContain("Đậu Đỏ");
    expect(input).not.toHaveProperty("reference_images");
  });
  it("uses dubbed video for ASR/render and invalidates it after a TTS attempt changes", () => {
    const tasks = audios();
    const image = {
      id: "image",
      kind: "image",
      scene_id: scene.id,
      scene_version: 2,
      status: "completed",
      input: {},
    } as FilmTask;
    const video = {
      ...image,
      id: "video",
      kind: "video",
      input: { imageTaskId: image.id, audioTaskIds: tasks.map((a) => a.id) },
    } as FilmTask;
    const dub = {
      ...image,
      id: "dub",
      kind: "dub",
      input: { videoTaskId: video.id },
    } as FilmTask;
    const transcript = {
      ...image,
      id: "asr",
      kind: "transcribe",
      input: { videoTaskId: dub.id },
    } as FilmTask;
    expect(finalClipKind(scene, "dubbed")).toBe("dub");
    expect(
      currentSceneTask(
        [transcript, dub, video, image, ...tasks],
        scene,
        "transcribe",
        "dubbed",
      )?.id,
    ).toBe("asr");
    tasks[0].id = "replacement";
    expect(
      currentSceneTask([dub, video, image, ...tasks], scene, "dub", "dubbed"),
    ).toBeUndefined();
  });
});
