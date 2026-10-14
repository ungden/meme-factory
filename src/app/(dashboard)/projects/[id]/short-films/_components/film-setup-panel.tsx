"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Sparkles, Users } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button, { buttonClasses } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import PriceLine from "@/components/ui/price-line";
import OutOfPointsModal from "@/components/wallet/out-of-points-modal";

export type SetupCharacter = {
  id: string;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  packComplete?: boolean;
  references: Record<string, string>;
  /** Ảnh đã tạo mà chưa khoá ở lần trước; dùng lại thay vì trả tiền vẽ lại. */
  drafts?: Partial<Record<"face" | "body" | "back", { path: string; url: string }>>;
};

const VIEWS = ["face", "body", "back"] as const;
const VIEW_LABEL: Record<(typeof VIEWS)[number], string> = {
  face: "ảnh cận mặt",
  body: "ảnh toàn thân",
  back: "ảnh sau lưng",
};

/**
 * Bước còn lại trước khi kênh làm được phim: mỗi nhân vật cần một bộ ảnh chuẩn
 * (cận mặt, toàn thân, sau lưng). Một nút vẽ hết; người dùng chỉ cần
 * chọn ai được lên phim nếu không muốn dùng tất cả.
 */
export function FilmSetupPanel({
  base,
  workspace,
  characters,
  castIds,
  pointsPerImage,
  available,
  owner,
  charactersHref,
  onSaveCast,
  onDone,
}: {
  base: string;
  workspace: number | null;
  characters: SetupCharacter[];
  castIds: string[];
  pointsPerImage: number;
  /** Điểm kênh đang có, kể cả phần tự chuyển từ ví. */
  available: number | null;
  owner: boolean;
  charactersHref: string;
  onSaveCast: (ids: string[]) => Promise<void>;
  onDone: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(castIds.length ? castIds : characters.map((c) => c.id));
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [needPoints, setNeedPoints] = useState(false);
  // Nhân vật đã lên phim được nhưng chưa có đủ ba góc vẫn nên được nâng cấp.
  const pending = characters.filter((c) => selected.includes(c.id) && !(c.packComplete ?? c.ready));
  const cost =
    pending.reduce((sum, character) => sum + VIEWS.filter((view) => !character.drafts?.[view]).length, 0) *
    pointsPerImage;

  async function call(body: Record<string, unknown>) {
    const response = await fetch(`${base}/film-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceVersion: workspace, ...body }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(new Error(data.error || "Chưa vẽ được ảnh. Bạn thử lại nhé."), { code: data.code as string | undefined });
    return data;
  }

  async function run() {
    setRunning(true);
    setError("");
    try {
      if ([...selected].sort().join() !== [...castIds].sort().join()) await onSaveCast(selected);
      let step = 0;
      const total = pending.reduce(
        (sum, character) => sum + VIEWS.filter((view) => !character.drafts?.[view]).length,
        0,
      );
      for (const character of pending) {
        const paths: Partial<Record<(typeof VIEWS)[number], string>> = Object.fromEntries(
          Object.entries(character.drafts || {}).map(([view, draft]) => [view, draft!.path]),
        );
        for (const view of VIEWS) {
          if (paths[view]) continue;
          step += 1;
          setProgress(`Đang vẽ ${VIEW_LABEL[view]} của ${character.name} (${step}/${total})`);
          try {
            const made = await call({ action: "generate", characterId: character.id, view, facePath: paths.face });
            paths[view] = made.path;
          } catch (cause) {
            // Ảnh lưng chỉ là thêm: thiếu nó vẫn khoá được bộ mặt + thân. Hết
            // điểm thì dừng hẳn để hỏi nạp, không bỏ qua.
            if (view !== "back" || (cause as { code?: string }).code === "INSUFFICIENT_POINTS") throw cause;
          }
        }
        setProgress(`Đang lưu bộ ảnh của ${character.name}`);
        await call({ action: "lock", characterId: character.id, paths });
      }
      setProgress("");
      await onDone();
    } catch (cause) {
      if ((cause as { code?: string }).code === "INSUFFICIENT_POINTS") setNeedPoints(true);
      else setError((cause as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (!characters.length)
    return (
      <EmptyState
        icon={Users}
        title="Kênh chưa có nhân vật"
        hint="Phim xoay quanh các nhân vật của kênh. Tạo ít nhất một nhân vật trước nhé."
        action={
          <Link href={charactersHref} className={buttonClasses("primary", "md")}>
            Tạo nhân vật
          </Link>
        }
      />
    );

  return (
    <section className="flex max-w-2xl flex-col gap-4" aria-labelledby="film-setup-title">
      <header>
        <h2 id="film-setup-title" className="text-xl font-semibold th-text-primary">Chọn nhân vật cho phim</h2>
        <p className="mt-1 text-sm th-text-secondary">
          Mỗi nhân vật cần đủ ảnh cận mặt, toàn thân, sau lưng để cảnh nào cũng đúng mặt. Ảnh còn thiếu sẽ được vẽ từ ảnh bạn đã có.
        </p>
      </header>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {characters.map((character) => {
          const chosen = selected.includes(character.id);
          const image = character.references.identity_face || character.avatarUrl;
          return (
            <li key={character.id}>
              <label className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border ${chosen ? "th-border-accent" : "th-border"} th-bg-card`}>
                <div className="flex aspect-square items-center justify-center th-bg-tertiary">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={character.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs th-text-muted">Chưa có ảnh</span>
                  )}
                </div>
                <span className="flex items-center gap-2 px-2.5 py-2 text-sm th-text-primary">
                  <input
                    type="checkbox"
                    checked={chosen}
                    disabled={!owner || running}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(character.id) ? current.filter((id) => id !== character.id) : [...current, character.id],
                      )
                    }
                  />
                  <span className="min-w-0 truncate font-medium">{character.name}</span>
                </span>
                <span className={`px-2.5 pb-2 text-xs ${(character.packComplete ?? character.ready) ? "th-text-success" : "th-text-secondary"}`}>
                  {(character.packComplete ?? character.ready) ? (
                    <span className="inline-flex items-center gap-1"><Check size={12} aria-hidden /> Bộ ảnh đầy đủ</span>
                  ) : !chosen ? "Không dùng trong phim" : character.ready ? "Dùng được · nên thêm ảnh" : "Còn thiếu ảnh"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <Alert>{error}</Alert>}
      {owner ? (
        <div className="flex flex-col gap-2">
          {running && progress ? (
            <p role="status" className="text-xs th-text-secondary">{progress}</p>
          ) : pending.length ? (
            <PriceLine points={cost} available={available} note={`${pending.length} nhân vật · vài phút`} />
          ) : (
            <p className="text-xs th-text-secondary">Các nhân vật đã chọn đều sẵn sàng.</p>
          )}
          <Button size="lg" className="w-fit" onClick={run} loading={running} disabled={!selected.length}>
            <Sparkles size={20} aria-hidden />
            {pending.length ? "Vẽ ảnh còn thiếu" : "Dùng các nhân vật này"}
          </Button>
        </div>
      ) : (
        <p className="text-sm th-text-secondary">Chủ kênh cần chọn nhân vật trước khi làm phim.</p>
      )}
      <OutOfPointsModal
        open={needPoints}
        onClose={() => setNeedPoints(false)}
        required={Math.max(1, cost)}
        current={available ?? 0}
        action="Vẽ ảnh nhân vật"
        onFunded={() => {
          setNeedPoints(false);
          void run();
        }}
      />
    </section>
  );
}
