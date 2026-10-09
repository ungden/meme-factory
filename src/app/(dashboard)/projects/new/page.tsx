"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Button from "@/components/ui/button";
import ChannelStages from "@/components/ui/channel-stages";
import { invalidateClientCache } from "@/lib/client-fetch";
import { LOOK_LABEL, type ChannelDraft, type ChannelLook } from "@/lib/channel-draft";

const LANDING_DRAFT = "aida:landing-draft";

const EMPTY: ChannelDraft = { name: "", audience: "", tone: "", positioning: "", look: "animated" };

/**
 * Bước 1 của một kênh: tả kênh bằng vài câu, AI điền hồ sơ, người dùng xem lại
 * rồi tạo. Chỉ tạo kênh; nhân vật là bước 2, nội dung là bước 3.
 */
export default function NewChannelPage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<ChannelDraft>(EMPTY);
  const [filled, setFilled] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Ý tưởng gõ ở trang giới thiệu hoặc ô nhập trang chính làm mô tả ban đầu.
  useEffect(() => {
    try {
      const draft = JSON.parse(window.sessionStorage.getItem(LANDING_DRAFT) || "null") as { idea?: string } | null;
      if (draft?.idea) setDescription(draft.idea);
    } catch {
      // Nháp hỏng thì bắt đầu trống.
    }
  }, []);

  async function fill() {
    setThinking(true);
    setError("");
    try {
      const response = await fetch("/api/channels/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.channel) throw new Error(payload.error || "AI chưa điền được. Hãy thử lại hoặc tự điền.");
      setDraft(payload.channel);
      setFilled(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, positioning: draft.positioning || description }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.project) throw new Error(payload.error || "Chưa tạo được kênh. Hãy thử lại.");
      invalidateClientCache("/api/projects/summaries");
      router.push(`/projects/${payload.project.slug}/characters?look=${payload.look}&new=1`);
    } catch (cause) {
      setError((cause as Error).message);
      setCreating(false);
    }
  }

  const set = (key: keyof ChannelDraft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="flex">
      <Sidebar />
      <main className="ml-0 min-h-screen flex-1 px-4 pb-10 pt-16 lg:ml-56 md:px-8 lg:pt-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <ChannelStages current={0} />
          <header>
            <h1 className="text-2xl font-bold th-text-primary">Kênh mới</h1>
            <p className="mt-1 text-sm th-text-secondary">
              Tả kênh của bạn bằng vài câu. AI điền hồ sơ kênh; bạn xem lại rồi tạo. Bước sau là dựng nhân vật.
            </p>
          </header>

          <div className="flex flex-col gap-2">
            <label htmlFor="channel-description" className="text-sm font-medium th-text-primary">Kênh của bạn nói về gì?</label>
            <textarea
              id="channel-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ví dụ: chuyện thường ngày của hai bé sinh đôi 5 tuổi và bố mẹ, hài kiểu đời thường, cho bố mẹ trẻ xem."
              className="w-full rounded-xl border th-border th-bg-input px-3 py-2.5 text-sm th-text-primary th-ring-accent focus:outline-none focus:ring-2"
            />
            <Button variant={filled ? "outline" : "primary"} onClick={fill} loading={thinking} disabled={description.trim().length < 6} className="w-fit">
              <Sparkles size={16} aria-hidden /> {filled ? "AI điền lại" : "AI điền hồ sơ kênh"}
            </Button>
          </div>

          <form onSubmit={create} className="flex flex-col gap-4 rounded-2xl border th-border th-bg-card p-4 sm:p-5">
            <Field id="channel-name" label="Tên kênh" value={draft.name} onChange={set("name")} max={60} placeholder="Ví dụ: Nhà Đậu Đỏ" />
            <Field id="channel-audience" label="Người xem" value={draft.audience} onChange={set("audience")} max={240} placeholder="Ví dụ: bố mẹ trẻ 25–35 tuổi" />
            <Field id="channel-tone" label="Giọng kể" value={draft.tone} onChange={set("tone")} max={300} placeholder="Ví dụ: hài đời thường, ấm áp" />
            <Field id="channel-positioning" label="Kênh tập trung kể chuyện gì" value={draft.positioning} onChange={set("positioning")} max={1000} multiline placeholder="Ví dụ: những tình huống nhỏ trong nhà, các bé nói thẳng điều người lớn ngại nói." />
            <fieldset>
              <legend className="mb-2 text-sm font-medium th-text-primary">Nhân vật của kênh trông thế nào?</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {(Object.keys(LOOK_LABEL) as ChannelLook[]).map((look) => (
                  <button
                    key={look}
                    type="button"
                    role="radio"
                    aria-checked={draft.look === look}
                    onClick={() => setDraft((current) => ({ ...current, look }))}
                    className={`min-h-10 rounded-full border px-4 text-sm ${draft.look === look ? "th-border-accent th-bg-accent-light th-text-accent" : "th-border th-text-secondary"}`}
                  >
                    {LOOK_LABEL[look]}
                  </button>
                ))}
              </div>
            </fieldset>
            {error && <p role="alert" className="rounded-lg border th-border-danger th-bg-danger-light px-3 py-2 text-sm th-text-danger">{error}</p>}
            <Button type="submit" size="lg" loading={creating} disabled={!draft.name.trim()} className="w-full sm:w-fit">
              Tạo kênh <ArrowRight size={17} aria-hidden />
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  max,
  placeholder,
  multiline,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  placeholder: string;
  multiline?: boolean;
}) {
  const className = "w-full rounded-lg border th-border th-bg-input px-3 py-2 text-sm th-text-primary th-ring-accent focus:outline-none focus:ring-2";
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm font-medium th-text-primary">
      {label}
      {multiline ? (
        <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={max} rows={2} placeholder={placeholder} className={`${className} font-normal`} />
      ) : (
        <input id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={max} placeholder={placeholder} className={`${className} font-normal`} />
      )}
    </label>
  );
}
