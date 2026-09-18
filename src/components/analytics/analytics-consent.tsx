"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";
import { GA_ID } from "@/lib/analytics";

const STORAGE_KEY = "aida:analytics-consent";

type Consent = "granted" | "denied";

/**
 * Lựa chọn của người dùng nằm ngoài React (localStorage), nên đọc bằng
 * `useSyncExternalStore` thay vì `useState` + `useEffect`: không có bước render
 * thừa và không lệch giữa các tab.
 *
 * `memoryConsent` là lưới đỡ cho trình duyệt chặn localStorage — lựa chọn vẫn
 * được tôn trọng trong phiên này, chỉ là lần sau sẽ hỏi lại.
 */
let memoryConsent: Consent | null = null;
const listeners = new Set<() => void>();

function readConsent(): Consent | null {
  if (memoryConsent) return memoryConsent;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "granted" || saved === "denied" ? saved : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeConsent(value: Consent) {
  memoryConsent = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Không lưu được thì lần sau hỏi lại.
  }
  for (const listener of listeners) listener();
}

/**
 * Hỏi trước rồi mới đo.
 *
 * Google Analytics trước đây được nạp trong <head> cho mọi khách, không hỏi gì
 * — trong khi Chính sách bảo mật nói người dùng kiểm soát dữ liệu của mình.
 * Banner này nhỏ, chỉ hiện một lần, và câu trả lời "không" được tôn trọng: khi
 * đó không có script đo lường nào được nạp.
 */
export default function AnalyticsConsent() {
  const consent = useSyncExternalStore(subscribe, readConsent, () => null);

  return (
    <>
      {consent === "granted" && GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
          </Script>
        </>
      )}

      {consent === null && (
        <div
          role="dialog"
          aria-label="Lựa chọn đo lường"
          className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-2xl rounded-2xl border p-4 shadow-lg sm:inset-x-6"
          style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
        >
          <p className="text-sm th-text-secondary">
            Chúng tôi muốn đo xem trang nào hữu ích để cải thiện sản phẩm. Bạn đồng ý không? Từ chối cũng không
            ảnh hưởng gì tới việc sử dụng.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => writeConsent("granted")}
              className="min-h-10 rounded-lg px-4 text-sm font-semibold text-white th-bg-accent"
            >
              Đồng ý
            </button>
            <button
              type="button"
              onClick={() => writeConsent("denied")}
              className="min-h-10 rounded-lg border px-4 text-sm font-semibold th-text-secondary"
              style={{ borderColor: "var(--border-primary)" }}
            >
              Không, cảm ơn
            </button>
          </div>
        </div>
      )}
    </>
  );
}
