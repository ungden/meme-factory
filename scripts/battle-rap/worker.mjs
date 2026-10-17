import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { download, ffmpeg, probe } from "../short-film/media.mjs";
import { ensureDiskSpace, isProjectMediaPath, uploadMedia } from "../short-film/storage.mjs";
import { normalizeClip, renderBattle } from "./media.mjs";

async function checked(promise) {
  const result = await promise;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export function makeBattleRapWorker(db, { appUrl, workerToken, fetchImpl = fetch } = {}) {
  async function checkpoint(run, phase, status = "queued", error = null) {
    await checked(db.rpc("checkpoint_battle_rap_run", { p_id: run.id, p_owner: run.lease_owner, p_state: run.state, p_phase: phase, p_status: status, p_error: error }));
  }
  async function persist(run, file, name, mime) {
    const saved = await uploadMedia({ db, prefix: `${run.project_id}/battle-rap/${run.id}`, file, name, mime,
      previous: run.state.uploads?.[name], onCheckpoint: async value => {
        run.state.uploads = { ...(run.state.uploads || {}), [name]: value };
        const rows = await checked(db.from("battle_rap_runs").update({ state: run.state }).eq("id", run.id).eq("lease_owner", run.lease_owner).eq("status", "running").gt("lease_expires_at", new Date().toISOString()).select("id"));
        if (!rows.length) throw new Error("BATTLE_LEASE_LOST");
      } });
    return saved.storagePath;
  }
  async function signed(run, storagePath) {
    if (!isProjectMediaPath(run.project_id, storagePath)) throw new Error("Media không thuộc kênh.");
    return (await checked(db.storage.from("content-media").createSignedUrl(storagePath, 3600))).signedUrl;
  }
  async function master(run, dir) {
    const music = run.state.music;
    if (!music?.path && !music?.sourceUrl) throw new Error("Chưa có bản nhạc master.");
    const file = path.join(dir, "master.audio");
    await download(music.path ? await signed(run, music.path) : music.sourceUrl, file, 30 * 1024 ** 2);
    return file;
  }
  async function mediaStep(run) {
    const dir = await mkdtemp(path.join(tmpdir(), "aida-battle-"));
    let lost = false;
    const timer = setInterval(() => {
      void db.rpc("heartbeat_battle_rap_run", { p_id: run.id, p_owner: run.lease_owner }).then(r => { if (r.error || !r.data) lost = true; });
    }, 30000);
    try {
      await ensureDiskSpace(path.join(dir, "check"), 768 * 1024 ** 2);
      if (run.phase === "ingest") {
        const file = await master(run, dir), info = await probe(file);
        if (!info.audio || info.duration < 10 || info.duration > 360) throw new Error("Bản nhạc cần có âm thanh và dài từ 10 đến 360 giây.");
        const music = run.state.music;
        if (!music.path) {
          const normalized = path.join(dir, "master.m4a");
          await ffmpeg(["-i", file, "-vn", "-c:a", "aac", "-b:a", "192k", normalized]);
          music.path = await persist(run, normalized, "music/master.m4a", "audio/mp4");
          music.duration = (await probe(normalized)).duration;
        } else music.duration = info.duration;
        delete music.sourceUrl;
        await checkpoint(run, "timing");
      } else if (run.phase === "excerpts") {
        run.state.excerpts ||= {};
        const block = run.state.blocks?.find(block => !run.state.excerpts[block.id]);
        if (!block) { await checkpoint(run, "video"); return; }
        const file = await master(run, dir), excerpt = path.join(dir, "excerpt.m4a");
        await ffmpeg(["-i", file, "-ss", String(block.start), "-t", String(block.end - block.start), "-vn", "-c:a", "aac", "-b:a", "192k", excerpt]);
        const length = (await probe(excerpt)).duration;
        if (length > 30.15 || length < block.end - block.start - 0.15) throw new Error("Đoạn nhạc chưa đúng thời lượng của cảnh.");
        run.state.excerpts[block.id] = await persist(run, excerpt, `music/${block.id}.m4a`, "audio/mp4");
        await checkpoint(run, "excerpts");
      } else if (run.phase === "video") {
        run.state.clipFiles ||= {};
        const block = run.state.blocks.find(block => run.state.clips?.[block.id] && !run.state.clipFiles[block.id]);
        const source = path.join(dir, "source.mp4"), target = path.join(dir, "clip.mp4");
        await download(run.state.clips[block.id], source, 256 * 1024 ** 2);
        await normalizeClip(source, target, block.end - block.start, run.input.aspectRatio);
        run.state.clipFiles[block.id] = await persist(run, target, `clips/${block.id}.mp4`, "video/mp4");
        await checkpoint(run, "video");
      } else if (run.phase === "render") {
        const audio = await master(run, dir), clips = [];
        for (const block of run.state.blocks || []) {
          const file = path.join(dir, `${block.id}.mp4`), storagePath = run.state.clipFiles?.[block.id];
          if (!storagePath) throw new Error("Có cảnh chưa được lưu hoàn chỉnh.");
          await download(await signed(run, storagePath), file, 256 * 1024 ** 2);
          clips.push(file);
        }
        const result = await renderBattle({ clips, audio, cues: run.state.cues, title: run.state.brief.suno.title, names: Object.fromEntries(run.state.brief.cast.map(c => [c.role, c.name])), duration: run.state.music.duration, format: run.input.aspectRatio, dir });
        const srt = path.join(dir, "lyrics.srt"), plan = path.join(dir, "production.json");
        await writeFile(srt, toSrt(run.state.cues));
        const { uploads: _uploads, ...portable } = run.state;
        void _uploads;
        await writeFile(plan, JSON.stringify({ input: run.input, ...portable }, null, 2));
        run.state.output = { video: await persist(run, result.output, "final/mv.mp4", "video/mp4"), subtitles: await persist(run, srt, "final/lyrics.srt", "application/x-subrip"), plan: await persist(run, plan, "final/production.json", "application/json"), duration: result.duration };
        if (lost) throw new Error("BATTLE_LEASE_LOST");
        await checkpoint(run, "done", "completed");
      }
    } catch (error) {
      if (lost || error.message === "BATTLE_LEASE_LOST") throw error;
      await checkpoint(run, run.phase, "failed", error.message || "Không xử lý được bài rap.");
    } finally { clearInterval(timer); await rm(dir, { recursive: true, force: true }); }
  }
  let lastSweep = 0;
  return {
    async tick() {
      if (!appUrl || !workerToken) return;
      if (Date.now() - lastSweep > 60000) { await checked(db.rpc("sweep_battle_rap_runs")); lastSweep = Date.now(); }
      const runs = await checked(db.rpc("claim_battle_rap_run")), run = runs?.[0];
      if (!run) return;
      const pendingClip = run.phase === "video" && run.state.blocks?.some(block => run.state.clips?.[block.id] && !run.state.clipFiles?.[block.id]);
      if (["ingest", "excerpts", "render"].includes(run.phase) || pendingClip) { await mediaStep(run); return; }
      const response = await fetchImpl(`${appUrl.replace(/\/$/, "")}/api/internal/battle-rap/advance`, { method: "POST", headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ runId: run.id, leaseOwner: run.lease_owner }), signal: AbortSignal.timeout(190000) });
      if (!response.ok) throw new Error(`Battle advance ${response.status}`);
    },
  };
}

export function toSrt(cues) {
  const stamp = s => {
    const ms = Math.round(s * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join("\n\n") + "\n";
}
