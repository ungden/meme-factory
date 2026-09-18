/**
 * Địa chỉ công khai của sản phẩm.
 *
 * Ba file từng khai lại cùng một hằng số, và cron thì dùng origin của chính lời
 * gọi — trên Vercel đó là URL của bản deploy, vốn nằm sau Deployment Protection,
 * nên cron tự gọi chính mình và nhận 401. Một chỗ khai duy nhất, và nó luôn là
 * tên miền thật.
 */
export const SITE_URL = (
  process.env.AIDA_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://aida.vn"
).replace(/\/$/, "");
