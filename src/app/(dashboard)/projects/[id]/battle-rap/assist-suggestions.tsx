"use client";

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";
import Alert from "@/components/ui/alert";

type Suggestions = { summary: string; basis: "image" | "content"; suggestions: { title: string; change: string; reason: string }[] };

export default function AssistSuggestions({ endpoint, runId, revision, assetKey, idea, disabled, onChoose, onCopy }: {
  endpoint: string; runId?: string; revision?: number; assetKey?: string; idea?: string; disabled?: boolean;
  onChoose?: (change: string) => void; onCopy?: (text: string) => void;
}) {
  const context = JSON.stringify({ runId, revision, assetKey, idea });
  const [question, setQuestion] = useState(""), [received, setReceived] = useState<{ context: string; data: Suggestions } | null>(null);
  const result = received?.context === context ? received.data : null;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef(0);
  async function suggest() {
    if (busy || disabled) return;
    const current = ++request.current;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, revision, assetKey, idea, question: question.trim() || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chưa lấy được gợi ý. Thử lại nhé.");
      if (current === request.current) setReceived({ context, data });
    } catch (cause) {
      if (current === request.current) setError(cause instanceof Error ? cause.message : "Chưa lấy được gợi ý.");
    } finally { if (current === request.current) setBusy(false); }
  }
  return <details className="rounded-xl border th-border p-3">
    <summary className="cursor-pointer text-sm font-medium th-text-secondary"><Sparkles size={14} aria-hidden className="mr-1.5 inline th-text-accent" />Gợi ý giúp tôi</summary>
    <div className="mt-3 min-w-0 space-y-3">
      <Textarea id={`suggest-${assetKey || runId || "idea"}`} label="Bạn đang phân vân điều gì?" placeholder="Có thể để trống để nhận vài hướng phù hợp." value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} rows={2} disabled={busy || disabled} />
      <Button type="button" variant="outline" size="sm" loading={busy} disabled={disabled} onClick={() => void suggest()}><Sparkles size={14} aria-hidden />{result ? "Gợi ý thêm" : "Xem gợi ý"}</Button>
      {error && <Alert>{error}</Alert>}
      {result && <div className="space-y-3">
        <p className="text-xs th-text-tertiary">{result.basis === "image" ? "Gợi ý dựa trên ảnh đang chọn." : "Gợi ý dựa trên nội dung bài."} Chọn gợi ý chưa làm lại hay chốt bản.</p>
        <p className="break-words text-sm th-text-secondary">{result.summary}</p>
        {result.suggestions.map((suggestion, index) => <div key={index} className="min-w-0 space-y-2 rounded-xl th-bg-tertiary p-3">
          <h4 className="break-words text-sm font-medium th-text-primary">{suggestion.title}</h4>
          <p className="break-words text-sm th-text-secondary">{suggestion.change}</p>
          <p className="break-words text-xs th-text-tertiary">{suggestion.reason}</p>
          {onChoose ? <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChoose(suggestion.change)}>Dùng gợi ý này</Button> : onCopy ? <Button type="button" size="sm" variant="outline" onClick={() => onCopy(suggestion.change)}>Sao chép gợi ý</Button> : null}
        </div>)}
      </div>}
    </div>
  </details>;
}
