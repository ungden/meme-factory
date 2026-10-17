import type { BattleBrief, Cue, Speaker } from "./contracts";

const clean = (word: string) => word.normalize("NFC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function parseSrt(source: string): { text: string; start: number; end: number }[] {
  const seconds = (h: string, m: string, s: string, ms: string) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  return source.replace(/\r/g, "").trim().split(/\n\s*\n/).map(block => {
    const match = block.match(/(?:^|\n)(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*\n([\s\S]+)/);
    if (!match) throw new Error("Tệp lời có thời gian chưa đúng định dạng SRT.");
    return { start: seconds(...match.slice(1, 5) as [string, string, string, string]), end: seconds(...match.slice(5, 9) as [string, string, string, string]), text: match[9].replace(/<[^>]+>/g, "").replace(/\n/g, " ").trim() };
  });
}

/** Chỉ gán người rap khi lời thực hát khớp đủ; không suy thời gian từ tốc độ đọc. */
export function alignCues(brief: BattleBrief, source: unknown, duration: number): Cue[] {
  const rows = typeof source === "string" ? parseSrt(source) : Array.isArray(source) ? source : [];
  if (!rows.length) throw new Error("Chưa có lời được căn theo bản nhạc. Tải tệp SRT của bài lên nhé.");
  const script = brief.sections.flatMap(section => section.lines).flatMap(line => line.text.split(/\s+/).map(word => ({ token: clean(word), lineId: line.id, speaker: line.speaker }))).filter(w => w.token);
  const cues: Cue[] = [];
  let cursor = 0, matched = 0, total = 0, previousEnd = 0;
  const represented = new Set<Speaker>();
  for (const item of rows) {
    if (!item || typeof item !== "object") throw new Error("Dữ liệu thời gian lời chưa hợp lệ.");
    const row = item as Record<string, unknown>;
    if (row.success === false) continue;
    const text = String(row.word ?? row.text ?? "").replace(/\[[^\]]*\]/g, "").trim();
    if (!text) continue;
    const start = Number(row.startS ?? row.start), end = Number(row.endS ?? row.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.25 || start < previousEnd - 0.08) throw new Error("Thời gian lời vượt bản nhạc hoặc chồng nhau.");
    previousEnd = end;
    const tokens = text.split(/\s+/).map(clean).filter(Boolean);
    if (!tokens.length) continue;
    const matches: typeof script = [];
    for (const token of tokens) {
      total++;
      const index = script.findIndex((word, i) => i >= cursor && i < cursor + 36 && word.token === token);
      if (index !== -1) { matches.push(script[index]); cursor = index + 1; matched++; }
    }
    const owner = matches[0];
    if (!owner || matches.some(m => m.speaker !== owner.speaker)) throw new Error("Có câu thực hát chưa xác định được người rap. Kiểm tra tệp lời nhé.");
    represented.add(owner.speaker);
    const previous = cues.at(-1);
    if (previous && previous.lineId === owner.lineId && end - previous.start <= 6 && (previous.text + text).length < 100) {
      previous.text += ` ${text}`;
      previous.end = end;
    } else cues.push({ start, end: Math.min(end, duration), text, speaker: owner.speaker, lineId: owner.lineId });
  }
  if (!total || matched / total < 0.85 || !represented.has("A") || !represented.has("B")) throw new Error("Lời thực hát khác nhiều so với bản viết. Cần kiểm tra lời và người rap trước khi làm cảnh.");
  return cues;
}

export function cuesToSrt(cues: Cue[]) {
  const stamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cues.map((c, index) => `${index + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join("\n\n") + "\n";
}
