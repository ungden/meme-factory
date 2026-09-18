/**
 * Mã đo lường Google Analytics.
 *
 * Đọc từ biến môi trường để mỗi môi trường (production, preview, local) đo vào
 * đúng chỗ của nó; giá trị mặc định giữ nguyên mã đang chạy để không mất số
 * liệu khi biến chưa được đặt. Đây là mã công khai, không phải bí mật.
 */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-6VSHM22RWN";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackPageView(url: string) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("config", GA_ID, { page_path: url });
}

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", eventName, params || {});
}
