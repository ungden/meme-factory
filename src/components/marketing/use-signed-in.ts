"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Trạng thái đăng nhập cho các trang giới thiệu. `ready` tách riêng vì trước khi
 * đọc xong phiên, nút chính không nên nhảy từ "Dùng thử" sang "Kênh của tôi".
 */
export function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const sync = (session: Session | null) => {
      setSignedIn(Boolean(session?.user));
      setReady(true);
    };

    const read = async () => {
      try {
        const result: { data: { session: Session | null } } = await supabase.auth.getSession();
        sync(result.data.session);
      } catch {
        sync(null);
      }
    };

    void read();

    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      sync(session);
    });

    // Đăng nhập ở tab khác rồi quay lại: đọc lại phiên để nút chính đúng ngay.
    const refreshOnFocus = () => void read();
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  return { ready, signedIn, appHref: ready && signedIn ? "/projects" : "/login" };
}
