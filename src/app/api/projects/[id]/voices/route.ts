import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  access,
  checkVersion,
  task,
  storeQuote,
  modelPrice,
  publicTasks,
  fail,
  FilmError,
} from "@/lib/short-film/server";
import {
  DESIGNED_CHILD_VOICES,
  GEMINI_TTS_MODELS,
  GEMINI_VOICE_PRESETS,
  VOICES,
  FILM_MODELS,
  type DesignedChildVoice,
  type FilmTask,
  type GeminiVoicePreset,
  isGeminiTtsModel,
} from "@/lib/short-film/contracts";
import { estimateGeminiTtsPrice } from "@/lib/ai-pricing";
export async function GET(
  r: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(r, (await params).id);
    const { data: voices, error } = await a.admin
      .from("character_voice_versions")
      .select("*, characters(name)")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .order("version", { ascending: false });
    if (error) throw error;
    const { data: tasks } = await a.admin
      .from("short_film_tasks")
      .select("*")
      .eq("project_id", a.project.id)
      .eq("workspace_version", a.project.workspace_version)
      .is("plan_id", null)
      .eq("kind", "tts")
      .order("created_at", { ascending: false })
      .limit(40);
    return NextResponse.json({
      voices,
      options: VOICES,
      geminiModels: GEMINI_TTS_MODELS,
      geminiVoices: GEMINI_VOICE_PRESETS,
      tasks: await publicTasks(
        a,
        ((tasks as FilmTask[]) || []).map((t) => ({
          ...t,
          input: {
            ...t.input,
            displayName: voices?.find((v) => v.id === t.input.voiceVersionId)
              ?.characters?.name,
          },
        })),
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(r, (await params).id);
    const body = await r.json();
    checkVersion(a, body);
    if (body.quoteId) {
      const { data: q } = await a.admin
        .from("short_film_quotes")
        .select("id")
        .eq("id", body.quoteId)
        .eq("project_id", a.project.id)
        .is("plan_id", null)
        .maybeSingle();
      if (!q) throw new FilmError("Báo giá không hợp lệ.");
      const { data, error } = await a.admin.rpc("accept_film_quote", {
        p_quote: q.id,
        p_actor: a.user.id,
        p_key: body.idempotencyKey,
      });
      if (error) throw new FilmError(error.message, 409);
      return NextResponse.json(data, { status: 202 });
    }
    const designedProfile =
      typeof body.designedProfile === "string" &&
      body.designedProfile in DESIGNED_CHILD_VOICES
        ? (body.designedProfile as DesignedChildVoice)
        : null;
    const geminiModel =
      typeof body.geminiModel === "string" && isGeminiTtsModel(body.geminiModel)
        ? body.geminiModel
        : null;
    const geminiPreset =
      typeof body.geminiVoicePreset === "string" &&
      body.geminiVoicePreset in GEMINI_VOICE_PRESETS
        ? (body.geminiVoicePreset as GeminiVoicePreset)
        : null;
    if ((geminiModel && !geminiPreset) || (!geminiModel && geminiPreset))
      throw new FilmError("Chọn đủ model và kiểu giọng Gemini.");
    if (
      !geminiModel &&
      !designedProfile &&
      !VOICES.includes(body.voiceId)
    )
      throw new FilmError("Giọng không có trong danh sách.");
    const { data: c } = await a.admin
      .from("characters")
      .select("id,name")
      .eq("id", body.characterId)
      .eq("project_id", a.project.id)
      .single();
    if (!c) throw new FilmError("Nhân vật không thuộc dự án.");
    const { data: last } = await a.admin
      .from("character_voice_versions")
      .select("version")
      .eq("character_id", c.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const id = crypto.randomUUID();
    const sampleText = `Xin chào, mình là ${c.name}. Hôm nay cả nhà cùng làm bánh nhé!`;
    const designed = designedProfile
      ? DESIGNED_CHILD_VOICES[designedProfile]
      : null;
    const gemini = geminiPreset ? GEMINI_VOICE_PRESETS[geminiPreset] : null;
    const voiceId = gemini
      ? gemini.voice
      : designed
      ? `Aida${designedProfile === "child_girl" ? "BanhBao" : "DauDo"}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`
      : body.voiceId;
    const speechSettings = gemini
      ? {}
      : designed
      ? { ...designed.settings }
      : { speed: 1, pitch: 0, volume: 1 };
    const settings = gemini
      ? {
          provider: "google",
          voicePreset: geminiPreset,
          voiceName: gemini.voice,
          direction: gemini.direction,
        }
      : designed
      ? { ...designed.settings, designedProfile }
      : speechSettings;
    const model = geminiModel || (designed ? designed.model : FILM_MODELS.tts);
    const inputs = gemini
      ? {
          text: sampleText,
          voice: gemini.voice,
          direction: gemini.direction,
          language: "vi",
        }
      : {
          text: sampleText,
          voice_id: voiceId,
          ...speechSettings,
          language_boost: "Vietnamese",
          format: "wav",
          sample_rate: 44100,
          channel: "1",
        };
    const points = designed
      ? null
      : geminiModel
        ? estimateGeminiTtsPrice({
            model: geminiModel,
            text: sampleText,
            requestedSeconds: 6,
          }).customerPoints
        : await modelPrice(model, inputs);
    const { error } = await a.admin.from("character_voice_versions").insert({
      id,
      project_id: a.project.id,
      workspace_version: a.project.workspace_version,
      character_id: c.id,
      version: (last?.version || 0) + 1,
      model,
      voice_id: voiceId,
      settings,
      created_by: a.user.id,
    });
    if (error) throw error;
    if (designed) {
      const designInputs = {
        prompt: designed.prompt,
        custom_voice_id: voiceId,
        text: sampleText,
      };
      const design = task(
        "voice_design",
        {
          model: FILM_MODELS.voice_design,
          providerInputs: designInputs,
          displayName: c.name,
          subjectKey: `voice-design:${c.id}:${id}`,
        },
        await modelPrice(FILM_MODELS.voice_design, designInputs),
      );
      const activation = task(
        "tts",
        {
          model,
          providerInputs: inputs,
          voiceVersionId: id,
          displayName: c.name,
          subjectKey: `voice:${c.id}:${id}`,
        },
        await modelPrice(model, inputs),
        undefined,
        [design.id],
      );
      return NextResponse.json({ quote: await storeQuote(a, [design, activation]) });
    }
    return NextResponse.json({
      quote: await storeQuote(a, [
        task(
          "tts",
          {
            model,
            provider: geminiModel ? "google" : "wavespeed",
            providerInputs: inputs,
            voiceVersionId: id,
            displayName: c.name,
            subjectKey: `voice:${c.id}:${id}`,
          },
          points!,
        ),
      ]),
    });
  } catch (e) {
    return fail(e);
  }
}
