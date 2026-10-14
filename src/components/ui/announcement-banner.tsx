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

const TYPE_CONFIG: Record<string, { icon: typeof Info; box: string; text: string }> = {
  info: { icon: Info, box: "th-bg-accent-light th-border-accent", text: "th-text-accent" },
  warning: { icon: AlertTriangle, box: "th-bg-warning-light th-border-warning", text: "th-text-warning" },
  success: { icon: CheckCircle, box: "th-bg-success-light th-border-success", text: "th-text-success" },
  promo: { icon: Gift, box: "th-bg-accent-soft th-border-accent", text: "th-text-accent" },
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

    const timeoutId = window.setTimeout(() => {
      try {
        const stored = sessionStorage.getItem("dismissed-announcements");
        if (stored) setDismissed(new Set(JSON.parse(stored)));
      } catch { /* ignore */ }
    }, 0);

    void fetchAnnouncements();
    return () => window.clearTimeout(timeoutId);
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
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${config.box}`}
          >
            <Icon size={18} className={`mt-px shrink-0 ${config.text}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${config.text}`}>{ann.title}</p>
              {ann.content && <p className="text-xs mt-0.5 th-text-secondary">{ann.content}</p>}
            </div>
            <button onClick={() => dismiss(ann.id)} aria-label="Đóng thông báo" className={`p-1 rounded-lg transition-all hover:opacity-70 ${config.text}`}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
