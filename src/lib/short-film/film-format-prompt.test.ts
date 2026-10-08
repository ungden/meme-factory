import { describe, expect, it } from "vitest";
import {
  compileFilmMotion,
  filmVideoInputs,
  nativeVoiceSamples,
  NATIVE_VOICE_MODEL,
  type FilmScene,
} from "./contracts";
import { cameraDirection } from "../film-camera-language";
import {
  SEEDANCE_20_FAST_TEXT_MODEL,
  SEEDANCE_25_TEXT_MODEL,
  defaultAudioMode,
} from "../video-models";

const doDo = {
  characterId: "do",
  name: "Đậu Đỏ",
  description: "Em trai tuổi chập chững, gương mặt bầu bĩnh",
  personality: "",
  imageUrl: "",
  referenceImages: [],
};

function talkScene(voice?: FilmScene["cast_snapshot"][number]["voice"]): FilmScene {
  return {
    setting: "chợ dân sinh buổi sáng",
    cast_snapshot: [{ ...doDo, ...(voice ? { voice } : {}) }],
    speaker_character_id: "do",
    storyboard: {
      version: 2,
      durationSeconds: 8,
      contentEndSeconds: 7,
      filmFormat: "talk_to_camera",
      beats: [
        {
          startSeconds: 0,
          endSeconds: 3.5,
          speakerCharacterId: "do",
          dialogue: "Lương con đâu rồi?",
          action: "bé nằm vật ra sàn",
          camera: cameraDirection("phone_ultrawide_low", "bé nằm giữa lối đi", "talk_to_camera"),
          motion: "bé đập tay xuống sàn",
          setting: "chợ dân sinh buổi sáng",
        },
        {
          startSeconds: 3.5,
          endSeconds: 7,
          speakerCharacterId: "do",
          dialogue: "Mới có ba ngày thôi mà.",
          action: "bé dí mặt sát máy",
          camera: cameraDirection("phone_face_push", "", "talk_to_camera"),
          motion: "bé chu môi",
          setting: "hành lang chung cư",
        },
      ],
    },
  } as unknown as FilmScene;
}

describe("prompt Seedance theo định dạng", () => {
  it("bé nói với máy: look điện thoại, nhìn ống kính và đổi nơi theo nhịp", () => {
    const prompt = compileFilmMotion(talkScene(), "dubbed", "9:16");
    expect(prompt).toContain("LOOK: video quay bằng điện thoại thật");
    expect(prompt).toContain("NHÌN MÁY");
    expect(prompt).toContain("Ở hành lang chung cư.");
    expect(prompt).toContain("điện thoại 0.5x cận mặt");
    expect(prompt).not.toContain("không đổi bối cảnh");
  });

  it("phim gia đình cũ giữ nguyên luật không đổi bối cảnh và không thêm look", () => {
    const scene = talkScene();
    delete scene.storyboard!.filmFormat;
    const prompt = compileFilmMotion(scene, "dubbed", "9:16");
    expect(prompt).toContain("không đổi bối cảnh");
    expect(prompt).not.toContain("LOOK:");
    expect(prompt).not.toContain("Ở hành lang");
  });
});

describe("Seedance 2.5 tự nói tiếng Việt", () => {
  const voice = {
    id: "v1",
    voice_id: "do-native",
    model: NATIVE_VOICE_MODEL,
    settings: {
      samplePath: "p/voices/do.wav",
      sampleSeconds: 6,
      direction: "giọng bé trai 20 tháng, cao, hơi ngọng",
    },
  };
  const packet = { urls: ["https://x/face.png"], bindings: ["@image1 = mặt."] };

  it("2.5 mặc định tự nói, 2.0 Fast mặc định lồng tiếng", () => {
    expect(defaultAudioMode(SEEDANCE_25_TEXT_MODEL)).toBe("native");
    expect(defaultAudioMode(SEEDANCE_20_FAST_TEXT_MODEL)).toBe("dubbed");
  });

  it("gửi giọng mẫu và gắn nó cho đúng người nói", () => {
    const inputs = filmVideoInputs(
      talkScene(voice),
      "native",
      "9:16",
      "720p",
      packet,
      0,
      SEEDANCE_25_TEXT_MODEL,
    );
    expect(inputs.generate_audio).toBe(true);
    expect(inputs.reference_audio_sources).toEqual([{ path: "p/voices/do.wav" }]);
    expect(inputs.prompt).toContain("Đậu Đỏ: giọng y hệt @audio1; giọng bé trai 20 tháng");
    expect(inputs.prompt).toContain("Không nhạc nền");
  });

  it("không gửi giọng mẫu cho 2.0 Fast, và bỏ giọng vượt trần 30 giây", () => {
    const fast = filmVideoInputs(
      talkScene(voice),
      "native",
      "9:16",
      "720p",
      packet,
      0,
      SEEDANCE_20_FAST_TEXT_MODEL,
    );
    expect(fast).not.toHaveProperty("reference_audio_sources");
    const long = { ...voice, settings: { ...voice.settings, sampleSeconds: 31 } };
    expect(nativeVoiceSamples(talkScene(long))).toEqual([]);
  });
});
