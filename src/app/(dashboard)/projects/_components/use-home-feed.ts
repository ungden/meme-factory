"use client";

import { useCallback, useEffect, useState } from "react";
import { IS_MOCK_MODE } from "@/lib/use-store";
import { feedIsBusy, type FeedItem } from "@/lib/home-feed";

/** Việc đang làm và vừa xong ở mọi kênh; trang chính và trang kênh dùng chung. */
export function useHomeFeed() {
  const [feed, setFeed] = useState<{ items: FeedItem[]; autopilot: Record<string, string> }>({ items: [], autopilot: {} });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    if (IS_MOCK_MODE) return setLoading(false);
    try {
      const response = await fetch("/api/home", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      setFeed(await response.json());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);
  const busy = feedIsBusy(feed.items);
  // Có việc đang chạy thì cập nhật nhanh để người dùng thấy kết quả về ngay.
  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, busy ? 5000 : 60000);
    return () => clearInterval(timer);
  }, [reload, busy]);
  return { ...feed, loading, failed, reload };
}
