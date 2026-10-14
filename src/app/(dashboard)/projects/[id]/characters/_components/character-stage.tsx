"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, ImagePlus, Plus, Search, Sparkles, Star, Users, X } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button, { buttonClasses } from "@/components/ui/button";
import Card, { CardContent } from "@/components/ui/card";
import ChannelStages from "@/components/ui/channel-stages";
import Chip from "@/components/ui/chip";
import EmptyState from "@/components/ui/empty-state";
import Input from "@/components/ui/input";
import { PageContainer, PageHeader, PageSkeleton } from "@/components/ui/page";
import PriceLine from "@/components/ui/price-line";
import Textarea from "@/components/ui/textarea";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";
import CharacterPackCard from "@/components/characters/character-pack-card";
import CharacterListToolbar from "@/components/characters/character-list-toolbar";
import {
  arrangeCharacters,
  CHARACTER_TOOLBAR_MIN,
  characterUsage,
  usageScore,
  type CharacterFilter,
  type CharacterSort,
} from "@/components/characters/character-list";
import { drawCost, isLocked, needsDrawing, PACK_VIEWS } from "@/components/characters/character-pack";
import { postJson, useCharacterPack } from "@/components/characters/use-character-pack";
import { formatPoints } from "@/lib/format";
import { useBaseImages } from "@/lib/use-templates";
import { useMemes } from "@/lib/use-store";
import { isChannelLook, LOOK_LABEL, type CastMember, type ChannelLook } from "@/lib/channel-draft";

const LAST_CHANNEL = "aida:home-channel";

/**
 * Bước 2 của một kênh: kho nhân vật. AIDA gợi ý nhân vật hợp với kênh, vẽ ảnh
 * đại diện và bộ ảnh chuẩn (cận mặt, toàn thân, sau lưng); hoặc người dùng đưa
 * ảnh của mình lên. Chủ kênh chốt bộ ảnh: từ đó meme, video và phim gắn nhân vật
 * nào sẽ lấy đúng bộ ảnh đó làm mẫu.
 */
export default function CharacterStage() {
  const { id: ref } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const pack = useCharacterPack(ref);
  const { status, load } = pack;
  const [look, setLook] = useState<ChannelLook>(isChannelLook(search.get("look")) ? (search.get("look") as ChannelLook) : "animated");
  const [suggestions, setSuggestions] = useState<Array<CastMember & { keep: boolean }>>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState<CastMember | null>(null);
  const [manualImage, setManualImage] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CharacterFilter>("all");
  const [sort, setSort] = useState<CharacterSort>("usage");
  const suggestedOnce = useRef(false);
  const manualImageInput = useRef<HTMLInputElement>(null);

  // Meme đã làm và biểu cảm dùng được: để chỉ ra nhân vật chủ lực của kênh.
  const { baseImages } = useBaseImages(ref, "ready");
  const { memes } = useMemes(ref);

  const { reload } = pack;
  useEffect(() => {
    void reload().then((loaded) => {
      // Kênh đã có nhân vật thì kiểu hình theo số đông nhân vật đang có.
      if (loaded && !search.get("look") && loaded.characters.length) {
        const real = loaded.characters.filter((character) => character.medium === "photoreal").length;
        setLook(real * 2 > loaded.characters.length ? "photoreal" : "animated");
      }
    });
  }, [reload, search]);

  const suggest = useCallback(async () => {
    setSuggesting(true);
    setError("");
    try {
      const payload = await postJson(`/api/projects/${ref}/characters/suggest`, { look, count: 3 });
      const list = (payload.characters || []) as CastMember[];
      if (!list.length) throw new Error("Chưa nghĩ ra nhân vật nào. Bạn thử lại nhé.");
      setSuggestions(list.map((member) => ({ ...member, keep: true })));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSuggesting(false);
    }
  }, [ref, look]);

  // Kênh trống: gợi ý ngay, người dùng chỉ việc chọn.
  useEffect(() => {
    if (!status || suggestedOnce.current || status.characters.length || !status.owner) return;
    suggestedOnce.current = true;
    void suggest();
  }, [status, suggest]);

  const usage = useMemo(() => characterUsage(baseImages, memes), [baseImages, memes]);

  const featured = useMemo(() => {
    if (!status || status.characters.length < 2) return null;
    let best: { id: string; name: string; ready: number; memes: number; baseId: string } | null = null;
    for (const character of status.characters) {
      const entry = usage.get(character.id);
      if (entry && usageScore(entry) > usageScore(best ?? undefined)) best = { id: character.id, name: character.name, ...entry };
    }
    return best;
  }, [status, usage]);

  const shown = useMemo(
    () => (status ? arrangeCharacters(status.characters, { query, filter, sort, usage }) : []),
    [status, query, filter, sort, usage],
  );

  async function addCharacters(members: CastMember[], image?: File) {
    setAdding(true);
    setError("");
    try {
      const created: string[] = [];
      for (const member of members) {
        const payload = await postJson(`/api/projects/${ref}/characters`, { ...member, look });
        if (payload.character?.id) created.push(payload.character.id);
      }
      setSuggestions([]);
      setManual(null);
      setManualImage(null);
      const fresh = await load();
      const target = image && fresh.characters.find((character) => character.id === created[0]);
      if (target && image) {
        setAdding(false);
        await pack.upload(target, image);
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setAdding(false);
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

  if (pack.missing) notFound();
  if (pack.loadError && !status) {
    return (
      <PageContainer>
        <PageHeader title="Nhân vật của kênh" />
        <Alert
          title="Chưa mở được nhân vật"
          action={
            <Button size="sm" variant="outline" onClick={() => void pack.reload()}>
              Thử lại
            </Button>
          }
        >
          {pack.loadError}
        </Alert>
      </PageContainer>
    );
  }
  if (!status) return <PageSkeleton blocks={3} />;

  const costPer = status.pointsPerImage;
  const pending = status.characters.filter(needsDrawing);
  const pendingCost = pending.reduce((sum, character) => sum + drawCost(character, "continue", costPer), 0);
  const lockedCount = status.characters.filter(isLocked).length;
  const busy = Boolean(pack.work) || adding;
  const keptCount = suggestions.filter((member) => member.keep).length;
  const showToolbar = status.characters.length >= CHARACTER_TOOLBAR_MIN;

  return (
    <PageContainer>
      <ChannelStages current={1} />
      <PageHeader
        title="Nhân vật của kênh"
        description="Gắn nhân vật vào meme, video, phim là bài nào cũng đúng gương mặt đó. Chốt bộ ảnh để AIDA luôn vẽ theo đúng bộ đó."
      />

      <div className="flex flex-col gap-6">
        {error && (
          <Alert
            action={
              <Button size="sm" variant="ghost" aria-label="Đóng" onClick={() => setError("")}>
                <X size={14} aria-hidden />
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {featured && (
          <Card>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-medium th-text-accent">
                  <Star size={12} aria-hidden /> Dùng nhiều nhất
                </p>
                <p className="mt-1 font-semibold th-text-primary">{featured.name}</p>
                <p className="text-xs th-text-tertiary">
                  {featured.ready} biểu cảm · {featured.memes} meme đã làm
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/projects/${ref}/editor?base=${featured.baseId}`} className={buttonClasses("primary", "sm")}>
                  Ghép chữ
                </Link>
                <Link href={`/projects/${ref}/characters/${featured.id}`} className={buttonClasses("outline", "sm")}>
                  Xem nhân vật
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {showToolbar && (
          <CharacterListToolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} sort={sort} onSort={setSort} />
        )}

        {showToolbar && shown.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Không có nhân vật nào khớp"
            hint="Thử tên khác hoặc bỏ lọc nhé."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Bỏ lọc
              </Button>
            }
          />
        ) : status.characters.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(showToolbar ? shown : status.characters).map((character) => (
              <li key={character.id}>
                <CharacterPackCard
                  character={character}
                  owner={status.owner}
                  busy={busy}
                  working={pack.work?.id === character.id ? pack.work.message : ""}
                  failure={pack.failure?.id === character.id ? pack.failure.message : ""}
                  pointsPerImage={costPer}
                  available={pack.points}
                  detailHref={`/projects/${ref}/characters/${character.id}`}
                  onDraw={(mode) => void pack.draw(character, mode)}
                  onApprove={() => void pack.approve(character)}
                  onUpload={(file) => void pack.upload(character, file)}
                />
              </li>
            ))}
          </ul>
        ) : (
          !status.owner && <EmptyState icon={Users} title="Kênh chưa có nhân vật" hint="Chủ kênh cần tạo nhân vật trước." />
        )}

        {status.owner && pending.length > 1 && (
          <div className="flex flex-col gap-2">
            <PriceLine points={pendingCost} available={pack.points} note="vài phút" />
            <div>
              <Button onClick={() => void pack.drawAll()} loading={busy} size="lg">
                <Sparkles size={16} aria-hidden /> Vẽ {pending.length} nhân vật
              </Button>
            </div>
          </div>
        )}

        {status.owner && (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold th-text-primary">
                  {status.characters.length ? "Thêm nhân vật" : "Gợi ý nhân vật"}
                </h2>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Kiểu hình nhân vật">
                  {(Object.keys(LOOK_LABEL) as ChannelLook[]).map((value) => (
                    <Chip key={value} role="radio" selected={look === value} onClick={() => setLook(value)}>
                      {LOOK_LABEL[value]}
                    </Chip>
                  ))}
                </div>
              </div>

              {suggesting && (
                <p className="text-sm th-text-secondary" aria-live="polite">
                  Đang nghĩ nhân vật hợp với kênh…
                </p>
              )}

              {suggestions.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {suggestions.map((member, index) => (
                    <li key={index} className={`rounded-xl border p-3 ${member.keep ? "th-border-accent" : "th-border"}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${member.name}`}
                          checked={member.keep}
                          className="h-4 w-4 shrink-0 th-accent-control"
                          onChange={() => setSuggestions((list) => list.map((item, i) => (i === index ? { ...item, keep: !item.keep } : item)))}
                        />
                        <Input
                          value={member.name}
                          onChange={(event) => setSuggestions((list) => list.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))}
                          aria-label="Tên nhân vật"
                          maxLength={40}
                          className="font-medium"
                        />
                      </div>
                      <Textarea
                        value={member.description}
                        onChange={(event) => setSuggestions((list) => list.map((item, i) => (i === index ? { ...item, description: event.target.value } : item)))}
                        aria-label="Ngoại hình"
                        rows={3}
                        maxLength={1200}
                        className="mt-2 text-sm"
                      />
                      {member.personality && <p className="mt-1 text-xs th-text-muted">{member.personality}</p>}
                    </li>
                  ))}
                </ul>
              )}

              {manual && (
                <div className="flex flex-col gap-2 rounded-xl border th-border p-3">
                  <Input
                    value={manual.name}
                    onChange={(event) => setManual({ ...manual, name: event.target.value })}
                    placeholder="Tên nhân vật"
                    aria-label="Tên nhân vật"
                    maxLength={40}
                  />
                  <Textarea
                    value={manual.description}
                    onChange={(event) => setManual({ ...manual, description: event.target.value })}
                    placeholder="Ngoại hình: tuổi, dáng, tóc, mặt, trang phục quen thuộc…"
                    aria-label="Ngoại hình"
                    rows={3}
                    maxLength={1200}
                  />
                  <Textarea
                    value={manual.personality}
                    onChange={(event) => setManual({ ...manual, personality: event.target.value })}
                    placeholder="Tính cách (không bắt buộc). Ví dụ: hay nghĩ nhiều, nói móc nhẹ nhàng…"
                    aria-label="Tính cách"
                    rows={2}
                    maxLength={600}
                  />
                  <input
                    ref={manualImageInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) setManualImage({ file, preview: URL.createObjectURL(file) });
                    }}
                  />
                  {manualImage ? (
                    <div className="flex items-center gap-3 rounded-xl th-bg-tertiary p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh xem trước trên máy */}
                      <img src={manualImage.preview} alt="Ảnh nhân vật" className="h-14 w-14 rounded-lg object-cover" />
                      <p className="flex-1 text-xs th-text-secondary">AIDA vẽ ba góc theo ảnh này.</p>
                      <Button size="sm" variant="ghost" aria-label="Bỏ ảnh" onClick={() => setManualImage(null)}>
                        <X size={14} aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="self-start" onClick={() => manualImageInput.current?.click()}>
                      <ImagePlus size={14} aria-hidden /> Thêm ảnh phác thảo hoặc ảnh có sẵn (không bắt buộc)
                    </Button>
                  )}
                </div>
              )}

              {manual && manualImage && (
                <PriceLine points={PACK_VIEWS.length * costPer} available={pack.points} note="vẽ ba góc theo ảnh của bạn" />
              )}
              <div className="flex flex-wrap gap-2">
                {keptCount > 0 && (
                  <Button onClick={() => addCharacters(suggestions.filter((member) => member.keep))} loading={adding}>
                    <Check size={16} aria-hidden /> Thêm {keptCount} nhân vật
                  </Button>
                )}
                {manual && (
                  <Button
                    onClick={() => addCharacters([manual], manualImage?.file)}
                    loading={adding}
                    disabled={!manual.name.trim() || manual.description.trim().length < 10}
                  >
                    <Check size={16} aria-hidden /> Thêm {manual.name.trim() || "nhân vật"}
                  </Button>
                )}
                <Button variant="outline" onClick={suggest} loading={suggesting} disabled={busy}>
                  <Sparkles size={16} aria-hidden /> {suggestions.length ? "Gợi ý khác" : "Gợi ý"}
                </Button>
                {!manual && (
                  <Button variant="ghost" onClick={() => setManual({ name: "", description: "", personality: "" })} disabled={busy}>
                    <Plus size={16} aria-hidden /> Tả nhân vật
                  </Button>
                )}
              </div>
              <p className="text-xs th-text-secondary">
                Thêm nhân vật không tốn điểm. Vẽ đủ ảnh cho một nhân vật khoảng {formatPoints((PACK_VIEWS.length + 1) * costPer)}, dùng ảnh của bạn
                khoảng {formatPoints(PACK_VIEWS.length * costPer)}.
              </p>
            </CardContent>
          </Card>
        )}

        {lockedCount > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border th-border-accent th-bg-card p-4 th-shadow-lg sm:sticky sm:bottom-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm th-text-primary">{lockedCount} nhân vật đã sẵn sàng.</p>
            <Button onClick={goCreate}>
              Làm bài mới <ArrowRight size={16} aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <OutOfPointsModal
        open={Boolean(pack.pointsNeeded)}
        onClose={() => pack.setPointsNeeded(null)}
        required={pack.pointsNeeded?.required ?? 0}
        current={pack.pointsNeeded?.current ?? 0}
        action="Vẽ nhân vật"
        onFunded={() => {
          const retry = pack.pointsNeeded?.retry;
          pack.setPointsNeeded(null);
          retry?.();
        }}
      />
    </PageContainer>
  );
}
