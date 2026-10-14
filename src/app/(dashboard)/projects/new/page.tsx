"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import Alert from "@/components/ui/alert";
import Button from "@/components/ui/button";
import Card, { CardContent } from "@/components/ui/card";
import Chip from "@/components/ui/chip";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import ChannelStages from "@/components/ui/channel-stages";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { invalidateClientCache } from "@/lib/client-fetch";
import { LOOK_LABEL, type ChannelDraft, type ChannelLook } from "@/lib/channel-draft";

const LANDING_DRAFT = "aida:landing-draft";
/** Ngắn hơn thế này thì máy chủ cũng từ chối điền giúp. */
const MIN_DESCRIPTION = 6;

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
  const autoFilled = useRef(false);

  async function fill(text = description) {
    setThinking(true);
    setError("");
    try {
      const response = await fetch("/api/channels/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.channel) throw new Error(payload.error || "Chưa điền sẵn được. Bạn thử lại hoặc tự điền nhé.");
      setDraft(payload.channel);
      setFilled(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setThinking(false);
    }
  }

  // Ý tưởng gõ ở trang giới thiệu hoặc ô nhập trang chính làm mô tả ban đầu.
  // Người dùng đã tả kênh một lần rồi, nên điền hồ sơ luôn thay vì bắt bấm
  // thêm "Điền giúp tôi". Ref chặn lần gọi thứ hai khi React chạy effect hai lần.
  useEffect(() => {
    if (autoFilled.current) return;
    autoFilled.current = true;
    let idea = "";
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(LANDING_DRAFT) || "null") as { idea?: string } | null;
      idea = typeof saved?.idea === "string" ? saved.idea.trim() : "";
    } catch {
      // Nháp hỏng thì bắt đầu trống.
    }
    if (!idea) return;
    setDescription(idea);
    if (idea.length >= MIN_DESCRIPTION) void fill(idea);
    // fill chỉ cần chạy một lần với mô tả từ nháp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (!response.ok || !payload.project) throw new Error(payload.error || "Chưa tạo được kênh. Bạn thử lại nhé.");
      invalidateClientCache("/api/projects/summaries");
      router.push(`/projects/${payload.project.slug}/characters?look=${payload.look}&new=1`);
    } catch (cause) {
      setError((cause as Error).message);
      setCreating(false);
    }
  }

  const set = (key: keyof ChannelDraft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <PageContainer width="form">
      <ChannelStages current={0} />
      <div className="mt-6">
        <PageHeader
          title="Kênh mới"
          description="Tả kênh trong vài câu, AIDA điền sẵn phần còn lại. Bạn xem lại rồi bấm Tạo kênh."
        />
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Textarea
            id="channel-description"
            label="Kênh của bạn nói về gì?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ví dụ: chuyện thường ngày của hai bé sinh đôi 5 tuổi và bố mẹ, hài kiểu đời thường, cho bố mẹ trẻ xem."
          />
          <Button
            variant={filled ? "outline" : "primary"}
            onClick={() => void fill()}
            loading={thinking}
            disabled={description.trim().length < MIN_DESCRIPTION}
            className="w-fit"
          >
            <Sparkles size={16} aria-hidden /> {thinking ? "Đang điền…" : filled ? "Điền lại" : "Điền giúp tôi"}
          </Button>
        </div>

        <Card>
          <CardContent>
            <form onSubmit={create} className="flex flex-col gap-4" aria-busy={thinking || undefined}>
              <Input id="channel-name" label="Tên kênh" value={draft.name} onChange={(event) => set("name")(event.target.value)} maxLength={60} placeholder="Ví dụ: Nhà Đậu Đỏ" />
              <Input id="channel-audience" label="Người xem" value={draft.audience} onChange={(event) => set("audience")(event.target.value)} maxLength={240} placeholder="Ví dụ: bố mẹ trẻ 25–35 tuổi" />
              <Input id="channel-tone" label="Giọng kể" value={draft.tone} onChange={(event) => set("tone")(event.target.value)} maxLength={300} placeholder="Ví dụ: hài đời thường, ấm áp" />
              <Textarea
                id="channel-positioning"
                label="Kênh hay kể chuyện gì"
                value={draft.positioning}
                onChange={(event) => set("positioning")(event.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="Ví dụ: những tình huống nhỏ trong nhà, các bé nói thẳng điều người lớn ngại nói."
              />
              <fieldset>
                <legend className="mb-2 text-sm font-medium th-text-secondary">Nhân vật của kênh trông thế nào?</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {(Object.keys(LOOK_LABEL) as ChannelLook[]).map((look) => (
                    <Chip
                      key={look}
                      role="radio"
                      selected={draft.look === look}
                      onClick={() => setDraft((current) => ({ ...current, look }))}
                    >
                      {LOOK_LABEL[look]}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" size="lg" loading={creating} disabled={!draft.name.trim() || thinking} className="w-full sm:w-fit">
                Tạo kênh <ArrowRight size={16} aria-hidden />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
