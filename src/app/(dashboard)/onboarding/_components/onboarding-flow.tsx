"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, RefreshCw, Sparkles, Users } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useProjects } from "@/lib/use-store";
import { useWallet } from "@/contexts/WalletContext";
import { createClient } from "@/lib/supabase/client";
import { invalidateClientCache } from "@/lib/client-fetch";
import {
  CONTENT_FIELDS,
  characterFromSuggestion,
  fanpageBrief,
  fieldById,
  projectDraft,
  suggestionError,
  type CharacterSuggestion,
} from "../_lib/onboarding";

type CreatedProject = { id: string; slug: string; name: string };

const STEPS = ["Fanpage của bạn", "Nhân vật", "Ảnh đầu tiên"];

function StepBar({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Tiến trình thiết lập">
      {STEPS.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li key={label} className={`flex min-w-0 items-center gap-2 ${index === current ? "flex-1" : "sm:flex-1"}`}>
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={{
                background: state === "todo" ? "var(--bg-tertiary)" : "var(--accent-primary)",
                color: state === "todo" ? "var(--text-muted)" : "#fff",
              }}
            >
              {state === "done" ? <Check size={14} /> : index + 1}
            </span>
            {/* Ba nhãn không vừa một màn 375px; chỉ bước đang làm cần tên. */}
            <span
              className={`truncate text-sm ${state === "current" ? "" : "hidden sm:inline"}`}
              aria-current={state === "current" ? "step" : undefined}
              style={{ color: state === "todo" ? "var(--text-muted)" : "var(--text-primary)" }}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OnboardingFlow() {
  const router = useRouter();
  const toast = useToast();
  const { create } = useProjects();
  const { points, refreshBalance } = useWallet();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [fieldId, setFieldId] = useState(CONTENT_FIELDS[0].id);
  const [audience, setAudience] = useState("");
  const [creating, setCreating] = useState(false);
  const [project, setProject] = useState<CreatedProject | null>(null);

  const [suggestions, setSuggestions] = useState<CharacterSuggestion[] | null>(null);
  const [suggestError, setSuggestError] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const [savingCharacter, setSavingCharacter] = useState(false);
  const [characterName, setCharacterName] = useState("");

  const field = useMemo(() => fieldById(fieldId), [fieldId]);

  // Người dùng tới từ trang chủ đã gõ một ý tưởng; giữ nó để bước 3 không bắt
  // họ nghĩ lại từ đầu.
  const [landingIdea, setLandingIdea] = useState("");
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("aida:landing-draft");
      const draft = raw ? (JSON.parse(raw) as { idea?: string }) : null;
      if (draft?.idea) setLandingIdea(draft.idea);
    } catch {
      // Nháp hỏng thì bỏ qua, không có gì để cứu.
    }
  }, []);

  const loadSuggestions = useCallback(
    async (created: CreatedProject) => {
      setSuggestions(null);
      setSuggestError("");
      try {
        const response = await fetch("/api/ai/suggest-characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: created.id,
            fanpage_description: fanpageBrief({ name: created.name, fieldId, audience }),
            count: 3,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(suggestionError(response.status, payload.error));
        const list = Array.isArray(payload.suggestions) ? (payload.suggestions as CharacterSuggestion[]) : [];
        if (!list.length) throw new Error("AI chưa nghĩ ra nhân vật nào phù hợp");
        setSuggestions(list);
      } catch (error) {
        setSuggestError(error instanceof Error ? error.message : suggestionError(0));
      }
    },
    [audience, fieldId],
  );

  async function handleCreateProject(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const draft = projectDraft({ name, fieldId, audience });
    const created = await create(draft);
    setCreating(false);
    if (!created) {
      toast.error("Chưa tạo được fanpage. Vui lòng thử lại.");
      return;
    }
    invalidateClientCache("/api/projects/summaries");
    const record = { id: created.id, slug: created.slug, name: created.name };
    setProject(record);
    setStep(1);
    void loadSuggestions(record);
    void refreshBalance();
  }

  async function handleSaveCharacter() {
    if (!project || chosen === null || !suggestions) return;
    const character = characterFromSuggestion({ ...suggestions[chosen], name: characterName || suggestions[chosen].name });
    if (!character) return;
    setSavingCharacter(true);
    const supabase = createClient();
    const { error } = await supabase.from("characters").insert({ project_id: project.id, ...character });
    setSavingCharacter(false);
    if (error) {
      toast.error("Chưa lưu được nhân vật. Bạn vẫn có thể tạo ảnh và thêm nhân vật sau.");
      return;
    }
    toast.success(`Đã thêm nhân vật "${character.name}"`);
    setStep(2);
  }

  function goToFirstImage(idea: string) {
    if (!project) return;
    const query = idea ? `?idea=${encodeURIComponent(idea)}` : "";
    router.push(`/projects/${project.slug}/generate${query}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 md:py-14">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] th-text-accent">
        <Sparkles size={14} /> Bắt đầu
      </div>
      <StepBar current={step} />

      {step === 0 && (
        <form onSubmit={handleCreateProject} className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Fanpage của bạn tên gì?</h1>
            <p className="mt-2 th-text-tertiary">
              Hai câu hỏi thôi. AIDA dùng chúng để gợi ý nhân vật và nội dung hợp với bạn.
            </p>
          </div>

          <Input
            id="fanpage-name"
            label="Tên fanpage"
            placeholder='VD: "Foxy Coffee"'
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoFocus
          />

          <fieldset>
            <legend className="mb-2 block text-sm font-medium th-text-secondary">Bạn làm nội dung về gì?</legend>
            <div className="flex flex-wrap gap-2">
              {CONTENT_FIELDS.map((item) => {
                const active = item.id === fieldId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFieldId(item.id)}
                    aria-pressed={active}
                    className="rounded-full border px-4 py-2 text-sm transition"
                    style={{
                      borderColor: active ? "var(--accent-primary)" : "var(--border-primary)",
                      background: active ? "color-mix(in srgb, var(--accent-primary) 12%, transparent)" : "var(--bg-card)",
                      color: active ? "var(--accent-primary)" : "var(--text-secondary)",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Input
            id="fanpage-audience"
            label="Bạn muốn nói với ai? (không bắt buộc)"
            placeholder="VD: dân văn phòng 25–35 tuổi ở Hà Nội"
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
          />

          <Button type="submit" loading={creating} size="lg" className="w-full sm:w-auto">
            Tiếp tục <ArrowRight size={17} />
          </Button>
        </form>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Chọn một nhân vật cho fanpage</h1>
            <p className="mt-2 th-text-tertiary">
              Nhân vật giúp mọi ảnh và video của bạn trông như cùng một người kể chuyện. Chọn một cái để bắt đầu —
              đổi hoặc thêm lúc nào cũng được.
            </p>
          </div>

          {!suggestions && !suggestError && (
            <div className="space-y-3" aria-live="polite">
              <p className="text-sm th-text-tertiary">Đang nghĩ giúp bạn vài nhân vật…</p>
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-2xl th-bg-card" />
              ))}
            </div>
          )}

          {suggestError && (
            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}>
              <p className="text-sm th-text-secondary">{suggestError}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => project && loadSuggestions(project)}>
                  <RefreshCw size={15} /> Thử lại
                </Button>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Bỏ qua bước này
                </Button>
              </div>
            </div>
          )}

          {suggestions && (
            <div className="space-y-3" role="radiogroup" aria-label="Nhân vật gợi ý">
              {suggestions.map((suggestion, index) => {
                const active = chosen === index;
                return (
                  <button
                    key={`${suggestion.name}-${index}`}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setChosen(index);
                      setCharacterName(suggestion.name);
                    }}
                    className="w-full rounded-2xl border p-4 text-left transition"
                    style={{
                      borderColor: active ? "var(--accent-primary)" : "var(--border-primary)",
                      background: active ? "color-mix(in srgb, var(--accent-primary) 8%, var(--bg-card))" : "var(--bg-card)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl th-bg-accent-light th-text-accent">
                        <Users size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold th-text-primary">
                          {suggestion.name}
                          {suggestion.role ? <span className="ml-2 text-sm font-normal th-text-tertiary">{suggestion.role}</span> : null}
                        </p>
                        {suggestion.description && <p className="mt-1 text-sm th-text-secondary">{suggestion.description}</p>}
                        {suggestion.why_fit && <p className="mt-1 text-sm th-text-tertiary">{suggestion.why_fit}</p>}
                      </div>
                    </div>
                  </button>
                );
              })}

              {chosen !== null && (
                <Input
                  id="character-name"
                  label="Tên nhân vật (sửa được)"
                  value={characterName}
                  onChange={(event) => setCharacterName(event.target.value)}
                />
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <Button onClick={handleSaveCharacter} disabled={chosen === null} loading={savingCharacter}>
                  Dùng nhân vật này <ArrowRight size={16} />
                </Button>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Để sau
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold th-text-primary">Xong. Tạo tấm ảnh đầu tiên nhé</h1>
            <p className="mt-2 th-text-tertiary">
              Bạn đang có <strong className="th-text-primary">{points} điểm</strong> tặng — đủ cho vài tấm ảnh đầu tiên,
              không cần nạp tiền.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium th-text-secondary">Chọn một ý tưởng, hoặc tự viết ở bước sau:</p>
            {[...(landingIdea ? [landingIdea] : []), ...field.ideas].map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => goToFirstImage(idea)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition th-text-secondary"
                style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}
              >
                {idea}
                <ArrowRight size={15} className="shrink-0 th-text-muted" />
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => goToFirstImage(landingIdea)}>
              Tạo ảnh đầu tiên <ArrowRight size={17} />
            </Button>
            <Button variant="ghost" onClick={() => project && router.push(`/projects/${project.slug}`)}>
              Vào fanpage
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
