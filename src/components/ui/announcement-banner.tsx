"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Info, AlertTriangle, CheckCircle, Gift } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
}

const TYPE_CONFIG: Record<string, { icon: typeof Info; bg: string; border: string; text: string }> = {
  info: { icon: Info, bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.3)", text: "#3b82f6" },
  warning: { icon: AlertTriangle, bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.3)", text: "#f59e0b" },
  success: { icon: CheckCircle, bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.3)", text: "#22c55e" },
  promo: { icon: Gift, bg: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.3)", text: "#ec4899" },
};

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("announcements")
          .select("id, title, content, type, is_active")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(3);
        setAnnouncements(data ?? []);
      } catch {
        // Table may not exist yet
      }
    };

    // Load dismissed from sessionStorage
    try {
      const stored = sessionStorage.getItem("dismissed-announcements");
      if (stored) setDismissed(new Set(JSON.parse(stored)));
    } catch { /* ignore */ }

    fetchAnnouncements();
  }, []);

  const dismiss = (id: string) => {
    const newDismissed = new Set(dismissed);
    newDismissed.add(id);
    setDismissed(newDismissed);
    try {
      sessionStorage.setItem("dismissed-announcements", JSON.stringify([...newDismissed]));
    } catch { /* ignore */ }
  };

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {visible.map((ann) => {
        const config = TYPE_CONFIG[ann.type] || TYPE_CONFIG.info;
        const Icon = config.icon;
        return (
          <div
            key={ann.id}
            className="flex items-start gap-3 px-4 py-3 rounded-xl border"
            style={{ background: config.bg, borderColor: config.border }}
          >
            <Icon size={18} style={{ color: config.text, marginTop: 1, flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: config.text }}>{ann.title}</p>
              {ann.content && <p className="text-xs mt-0.5" style={{ color: config.text, opacity: 0.8 }}>{ann.content}</p>}
            </div>
            <button onClick={() => dismiss(ann.id)} className="p-1 rounded-lg transition-all hover:opacity-70" style={{ color: config.text }}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
