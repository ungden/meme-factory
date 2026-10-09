"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, ImagePlus, Plus, RefreshCw, Sparkles } from "lucide-react";
import Button from "@/components/ui/button";
import ChannelStages from "@/components/ui/channel-stages";
import { createClient } from "@/lib/supabase/client";
import { stripImageMetadataFromFile } from "@/lib/image-metadata";
import { isChannelLook, LOOK_LABEL, type CastMember, type ChannelLook } from "@/lib/channel-draft";

type View = "face" | "body" | "back";
const VIEWS: View[] = ["face", "body", "back"];
const VIEW_LABEL: Record<View, string> = { face: "Cận mặt", body: "Toàn thân", back: "Sau lưng" };
const VIEW_ROLE: Record<View, string> = { face: "identity_face", body: "identity_body", back: "look" };

type StageCharacter = {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  medium: "photoreal" | "animated";
  ready: boolean;
  packComplete: boolean;
  references: Record<string, string>;
  drafts?: Partial<Record<View, { path: string; url: string }>>;
};

type Status = {
  owner: boolean;
  projectId: string;
  workspaceVersion: number;
  pointsPerImage: number;
  profile: { roles?: Array<{ characterId: string }> } | null;
  channel: { audience: string; tone: string; positioning: string };
  characters: StageCharacter[];
};

const LAST_CHANNEL = "aida:home-channel";

function hasPack(character: StageCharacter) {
  return character.packComplete || character.ready;
}

/**
 * Bước 2 của một kênh: dựng kho nhân vật. AI gợi ý nhân vật hợp với kênh, vẽ
 * ảnh gốc và bộ ảnh chuẩn (cận mặt, toàn thân, sau lưng); hoặc người dùng tải
 * ảnh của mình lên làm ảnh gốc. Duyệt thì khoá lại: từ đó meme, video và phim
 * gắn nhân vật nào sẽ lấy đúng bộ ảnh đó làm tham chiếu.
 */
export default function CharacterStage() {
  const { id: ref } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const base = `/api/projects/${ref}`;
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [look, setLook] = useState<ChannelLook>(isChannelLook(search.get("look")) ? (search.get("look") as ChannelLook) : "animated");
  const [suggestions, setSuggestions] = useState<Array<CastMember & { keep: boolean }>>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState<CastMember | null>(null);
  const [work, setWork] = useState<{ id: string; message: string } | null>(null);
  const [error, setError] = useState("");
  const suggestedOnce = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(`${base}/film-setup`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Chưa tải được nhân vật của kênh.");
    setStatus(payload as Status);
    return payload as Status;
  }, [base]);

  useEffect(() => {
    load()
      .then((loaded) => {
        // Kênh đã có nhân vật thì kiểu hình theo số đông nhân vật đang có.
        if (!search.get("look") && loaded.characters.length) {
          const real = loaded.characters.filter((character) => character.medium === "photoreal").length;
          setLook(real * 2 > loaded.characters.length ? "photoreal" : "animated");
        }
      })
      .catch((cause) => setLoadError((cause as Error).message));
  }, [load, search]);

  async function post(path: string, body: Record<string, unknown>) {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Chưa làm được. Hãy thử lại.");
    return payload;
  }

  const suggest = useCallback(async () => {
    setSuggesting(true);
    setError("");
    try {
      const payload = await post("/characters/suggest", { look, count: 3 });
      const list = (payload.characters || []) as CastMember[];
      if (!list.length) throw new Error("AI chưa nghĩ ra nhân vật nào. Hãy thử lại.");
      setSuggestions(list.map((member) => ({ ...member, keep: true })));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSuggesting(false);
    }
    // post chỉ phụ thuộc base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, look]);

  // Kênh trống: AI gợi ý ngay, người dùng chỉ việc chọn.
  useEffect(() => {
    if (!status || suggestedOnce.current || status.characters.length || !status.owner) return;
    suggestedOnce.current = true;
    void suggest();
  }, [status, suggest]);

  async function addCharacters(members: CastMember[]) {
    setAdding(true);
    setError("");
    try {
      for (const member of members) await post("/characters", { ...member, look });
      setSuggestions([]);
      setManual(null);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setAdding(false);
    }
  }

  /** Ảnh gốc (nếu cần) rồi ba góc của bộ ảnh chuẩn; xong thì chờ người dùng duyệt. */
  async function draw(character: StageCharacter, redrawOrigin: boolean) {
    if (!status) return;
    setError("");
    const say = (message: string) => setWork({ id: character.id, message });
    try {
      if (redrawOrigin || !character.avatarUrl) {
        say(`Đang vẽ ${character.name}…`);
        await post("/film-setup", { workspaceVersion: status.workspaceVersion, action: "origin", characterId: character.id });
      }
      let facePath = "";
      for (const view of VIEWS) {
        say(`Đang vẽ ảnh ${VIEW_LABEL[view].toLowerCase()} của ${character.name}…`);
        try {
          const made = await post("/film-setup", {
            workspaceVersion: status.workspaceVersion,
            action: "generate",
            characterId: character.id,
            view,
            facePath: facePath || undefined,
          });
          if (view === "face") facePath = made.path;
        } catch (cause) {
          // Ảnh sau lưng chỉ là thêm: thiếu nó vẫn khoá được cận mặt + toàn thân.
          if (view !== "back") throw cause;
        }
      }
      await load();
    } catch (cause) {
      setError((cause as Error).message);
      await load().catch(() => undefined);
    } finally {
      setWork(null);
    }
  }

  async function drawAll() {
    for (const character of status?.characters || []) {
      if (hasPack(character) || character.drafts?.face) continue;
      await draw(character, false);
    }
  }

  async function approve(character: StageCharacter) {
    if (!status) return;
    setError("");
    setWork({ id: character.id, message: `Đang lưu bộ ảnh của ${character.name}…` });
    try {
      const paths = Object.fromEntries(Object.entries(character.drafts || {}).map(([view, draft]) => [view, draft!.path]));
      await post("/film-setup", { workspaceVersion: status.workspaceVersion, action: "lock", characterId: character.id, paths });
      // Nhân vật đã khoá vào dàn của kênh: phim và meme lấy họ làm tham chiếu.
      const locked = new Set([
        ...status.characters.filter(hasPack).map((item) => item.id),
        ...(status.profile?.roles || []).map((role) => role.characterId),
        character.id,
      ]);
      await post("/channel-profile", {
        audience: status.channel.audience || "Người xem video ngắn ở Việt Nam",
        tone: status.channel.tone || "Hài đời thường, ấm áp",
        positioning: status.channel.positioning || "Những câu chuyện nhỏ của các nhân vật trong kênh.",
        characterIds: [...locked].filter((id) => status.characters.some((item) => item.id === id)),
      }).catch(() => undefined);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWork(null);
    }
  }

  async function upload(character: StageCharacter, file: File) {
    if (!status) return;
    setError("");
    setWork({ id: character.id, message: "Đang tải ảnh lên…" });
    try {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Chọn ảnh PNG, JPG hoặc WEBP.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Ảnh lớn quá 10 MB.");
      const supabase = createClient();
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${status.projectId}/${character.id}/${Date.now()}.${ext}`;
      // Kho ảnh nhân vật công khai: gỡ GPS và dấu vết máy chụp trước khi tải lên.
      const clean = await stripImageMetadataFromFile(file);
      const { error: uploadError } = await supabase.storage.from("character-poses").upload(path, clean, { contentType: file.type });
      if (uploadError) throw new Error("Chưa tải được ảnh lên. Hãy thử lại.");
      const url = supabase.storage.from("character-poses").getPublicUrl(path).data.publicUrl;
      const { error: poseError } = await supabase
        .from("character_poses")
        .insert({ character_id: character.id, name: "Ảnh của bạn", emotion: "neutral", image_url: url });
      if (poseError) throw new Error("Chưa lưu được ảnh. Hãy thử lại.");
      await supabase.from("characters").update({ avatar_url: url }).eq("id", character.id);
      const fresh = await load();
      const updated = fresh.characters.find((item) => item.id === character.id);
      if (updated) await draw(updated, false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWork(null);
    }
  }

  function goCreate() {
    if (status) {
      try {
        window.localStorage.setItem(LAST_CHANNEL, status.projectId);
      } catch {
        // Chỉ là ghi nhớ kênh cho ô nhập.
      }
    }
    router.push("/projects");
  }

  if (loadError) return <p role="alert" className="p-6 text-sm th-text-danger">{loadError}</p>;
  if (!status) return <div className="mx-auto mt-20 h-64 max-w-3xl animate-pulse rounded-2xl th-bg-card" />;

  const costPer = status.pointsPerImage;
  const pending = status.characters.filter((character) => !hasPack(character) && !character.drafts?.face);
  const pendingCost = pending.reduce((sum, character) => sum + (character.avatarUrl ? 3 : 4) * costPer, 0);
  const lockedCount = status.characters.filter(hasPack).length;
  const busy = Boolean(work) || adding;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-10 pt-16 sm:px-6 lg:pt-8">
      <ChannelStages current={1} />
      <header>
        <h1 className="text-2xl font-bold th-text-primary">Nhân vật của kênh</h1>
        <p className="mt-1 text-sm th-text-secondary">
          Mỗi nhân vật có một bộ ảnh chuẩn. Làm meme, video hay phim, bạn gắn nhân vật nào thì AI lấy đúng bộ ảnh đó làm
          tham chiếu, nên ai cũng giữ một gương mặt qua mọi bài.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border th-border-danger th-bg-danger-light px-3 py-2 text-sm th-text-danger">
          {error}{" "}
          {/điểm/i.test(error) && <Link href="/wallet" className="font-semibold underline">Nạp điểm</Link>}
        </p>
      )}

      {status.characters.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {status.characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              owner={status.owner}
              busy={busy}
              working={work?.id === character.id ? work.message : ""}
              costPer={costPer}
              detailHref={`/projects/${ref}/mascots/${character.id}`}
              onDraw={(redraw) => draw(character, redraw)}
              onApprove={() => approve(character)}
              onUpload={(file) => upload(character, file)}
            />
          ))}
        </ul>
      )}

      {status.owner && pending.length > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={drawAll} loading={busy} size="lg">
            <Sparkles size={17} aria-hidden /> AI vẽ {pending.length} nhân vật
          </Button>
          <span className="text-xs th-text-secondary">Khoảng {pendingCost.toLocaleString("vi-VN")} điểm · vài phút</span>
        </div>
      )}

      {status.owner && (
        <section className="flex flex-col gap-3 rounded-2xl border th-border th-bg-card p-4 sm:p-5" aria-labelledby="add-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="add-title" className="text-lg font-semibold th-text-primary">
              {status.characters.length ? "Thêm nhân vật" : "AI gợi ý nhân vật cho kênh"}
            </h2>
            <div className="flex rounded-full border th-border p-0.5" role="radiogroup" aria-label="Kiểu hình nhân vật">
              {(Object.keys(LOOK_LABEL) as ChannelLook[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={look === value}
                  onClick={() => setLook(value)}
                  className={`min-h-8 rounded-full px-3 text-xs font-medium ${look === value ? "th-bg-accent-light th-text-accent" : "th-text-secondary"}`}
                >
                  {LOOK_LABEL[value]}
                </button>
              ))}
            </div>
          </div>

          {suggesting && <p className="text-sm th-text-secondary" aria-live="polite">AI đang nghĩ nhân vật hợp với kênh…</p>}

          {suggestions.length > 0 && (
            <ul className="flex flex-col gap-3">
              {suggestions.map((member, index) => (
                <li key={index} className={`rounded-xl border p-3 ${member.keep ? "th-border-accent" : "th-border"}`}>
                  <label className="flex items-center gap-2 text-sm font-medium th-text-primary">
                    <input
                      type="checkbox"
                      checked={member.keep}
                      onChange={() => setSuggestions((list) => list.map((item, i) => (i === index ? { ...item, keep: !item.keep } : item)))}
                    />
                    <input
                      value={member.name}
                      onChange={(event) => setSuggestions((list) => list.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))}
                      aria-label="Tên nhân vật"
                      maxLength={40}
                      className="min-w-0 flex-1 rounded-md border th-border th-bg-input px-2 py-1"
                    />
                  </label>
                  <textarea
                    value={member.description}
                    onChange={(event) => setSuggestions((list) => list.map((item, i) => (i === index ? { ...item, description: event.target.value } : item)))}
                    aria-label="Ngoại hình"
                    rows={3}
                    maxLength={1200}
                    className="mt-2 w-full rounded-md border th-border th-bg-input px-2 py-1.5 text-sm th-text-secondary"
                  />
                  {member.personality && <p className="mt-1 text-xs th-text-muted">{member.personality}</p>}
                </li>
              ))}
            </ul>
          )}

          {manual && (
            <div className="flex flex-col gap-2 rounded-xl border th-border p-3">
              <input
                value={manual.name}
                onChange={(event) => setManual({ ...manual, name: event.target.value })}
                placeholder="Tên nhân vật"
                maxLength={40}
                className="rounded-md border th-border th-bg-input px-2 py-1.5 text-sm th-text-primary"
              />
              <textarea
                value={manual.description}
                onChange={(event) => setManual({ ...manual, description: event.target.value })}
                placeholder="Ngoại hình: tuổi, dáng, tóc, mặt, trang phục quen thuộc…"
                rows={3}
                maxLength={1200}
                className="rounded-md border th-border th-bg-input px-2 py-1.5 text-sm th-text-primary"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {suggestions.some((member) => member.keep) && (
              <Button onClick={() => addCharacters(suggestions.filter((member) => member.keep))} loading={adding}>
                <Check size={16} aria-hidden /> Thêm {suggestions.filter((member) => member.keep).length} nhân vật
              </Button>
            )}
            {manual && (
              <Button onClick={() => addCharacters([manual])} loading={adding} disabled={!manual.name.trim() || manual.description.trim().length < 10}>
                <Check size={16} aria-hidden /> Thêm {manual.name.trim() || "nhân vật"}
              </Button>
            )}
            <Button variant="outline" onClick={suggest} loading={suggesting} disabled={busy}>
              <Sparkles size={16} aria-hidden /> {suggestions.length ? "Gợi ý khác" : "AI gợi ý"}
            </Button>
            {!manual && (
              <Button variant="ghost" onClick={() => setManual({ name: "", description: "", personality: "" })} disabled={busy}>
                <Plus size={16} aria-hidden /> Tự tả nhân vật
              </Button>
            )}
          </div>
          <p className="text-xs th-text-secondary">
            Thêm nhân vật chưa tốn điểm. Vẽ một nhân vật (ảnh gốc và bộ ảnh chuẩn) khoảng {(4 * costPer).toLocaleString("vi-VN")} điểm; dùng ảnh của bạn thì khoảng {(3 * costPer).toLocaleString("vi-VN")} điểm.
          </p>
        </section>
      )}

      {lockedCount > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border th-border-accent th-bg-card p-4 shadow-lg sm:sticky sm:bottom-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm th-text-primary">
            {lockedCount} nhân vật đã sẵn sàng. Làm meme, video hay phim và gắn họ vào bài.
          </p>
          <Button onClick={goCreate}>
            Làm nội dung <ArrowRight size={16} aria-hidden />
          </Button>
        </div>
      )}
      {!status.owner && !lockedCount && (
        <p className="text-sm th-text-secondary">Chủ kênh cần dựng nhân vật trước.</p>
      )}
    </div>
  );
}

function CharacterCard({
  character,
  owner,
  busy,
  working,
  costPer,
  detailHref,
  onDraw,
  onApprove,
  onUpload,
}: {
  character: StageCharacter;
  owner: boolean;
  busy: boolean;
  working: string;
  costPer: number;
  detailHref: string;
  onDraw: (redrawOrigin: boolean) => void;
  onApprove: () => void;
  onUpload: (file: File) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = hasPack(character);
  const drafts = character.drafts || {};
  const waiting = !locked && Boolean(drafts.face);
  const images = locked
    ? VIEWS.map((view) => ({ view, url: character.references[VIEW_ROLE[view]] || "" }))
    : VIEWS.map((view) => ({ view, url: drafts[view]?.url || "" }));
  const label = locked ? "Đã khoá" : waiting ? "Chờ bạn duyệt" : character.avatarUrl ? "Có ảnh gốc" : "Chưa có ảnh";

  return (
    <li className="flex flex-col gap-3 rounded-2xl border th-border th-bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl th-bg-tertiary">
          {character.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh nằm ở kho lưu trữ của app
            <img src={character.avatarUrl} alt={character.name} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold th-text-primary">
            <span className="truncate">{character.name}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${locked ? "th-bg-success-light th-text-success" : waiting ? "th-bg-warning-light th-text-warning" : "th-bg-tertiary th-text-muted"}`}>
              {label}
            </span>
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs th-text-secondary">{character.description}</p>
        </div>
      </div>

      {(locked || waiting) && (
        <div className="grid grid-cols-3 gap-2">
          {images.map(({ view, url }) => (
            <figure key={view} className="overflow-hidden rounded-lg th-bg-tertiary">
              <div className="aspect-[3/4]">
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh nằm ở kho lưu trữ của app
                  <img src={url} alt={`${character.name} · ${VIEW_LABEL[view]}`} className="h-full w-full object-cover" />
                )}
              </div>
              <figcaption className="px-1.5 py-1 text-[11px] th-text-muted">{VIEW_LABEL[view]}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {working ? (
        <p className="text-sm th-text-accent" aria-live="polite">{working}</p>
      ) : owner ? (
        <div className="flex flex-wrap gap-2">
          {waiting && (
            <Button size="sm" onClick={onApprove} disabled={busy}>
              <Check size={15} aria-hidden /> Dùng bộ này
            </Button>
          )}
          {!locked && !waiting && (
            <Button size="sm" onClick={() => onDraw(false)} disabled={busy}>
              <Sparkles size={15} aria-hidden /> {character.avatarUrl ? "Làm bộ ảnh chuẩn" : "AI vẽ"} · {((character.avatarUrl ? 3 : 4) * costPer).toLocaleString("vi-VN")} điểm
            </Button>
          )}
          {waiting && (
            <Button size="sm" variant="outline" onClick={() => onDraw(true)} disabled={busy}>
              <RefreshCw size={15} aria-hidden /> Vẽ lại
            </Button>
          )}
          {!locked && (
            <>
              <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()} disabled={busy}>
                <ImagePlus size={15} aria-hidden /> Dùng ảnh của bạn
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onUpload(file);
                }}
              />
            </>
          )}
          {locked && (
            <Link href={detailHref} className="inline-flex min-h-8 items-center text-sm font-medium th-text-accent underline-offset-2 hover:underline">
              Biểu cảm và ảnh khác
            </Link>
          )}
        </div>
      ) : null}
    </li>
  );
}
