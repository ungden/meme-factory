#!/usr/bin/env node
/**
 * Kiểm tra nhanh bề mặt công khai của một bản đã deploy.
 *
 * Build xanh không có nghĩa là trang chạy: biến môi trường thiếu, middleware
 * chặn nhầm, hay một trang public bị đẩy ra sau đăng nhập đều chỉ lộ ra khi có
 * người mở trình duyệt. Script này mở thay họ, trong vài giây, và nói rõ cái gì
 * hỏng.
 *
 *   node scripts/smoke.mjs                  # kiểm https://aida.vn
 *   node scripts/smoke.mjs http://localhost:3000
 */
import process from "node:process";
import { pathToFileURL } from "node:url";

/**
 * Mỗi mục: đường dẫn, mã trạng thái chấp nhận được, và một mẩu chữ bắt buộc
 * phải có trong phản hồi. Thiếu mẩu chữ nghĩa là trang trả về đúng mã nhưng nội
 * dung đã sai — thứ mà kiểm tra theo status code không bao giờ bắt được.
 */
export const CHECKS = [
  { path: "/", status: [200], contains: "AIDA" },
  { path: "/pricing", status: [200], contains: "điểm" },
  { path: "/help", status: [200], contains: "Hỗ trợ" },
  { path: "/login", status: [200], contains: "Đăng nhập" },
  { path: "/terms", status: [200], contains: "Điều khoản" },
  { path: "/privacy", status: [200], contains: "bảo mật" },
  { path: "/robots.txt", status: [200], contains: "Sitemap:" },
  { path: "/sitemap.xml", status: [200], contains: "<urlset" },
  { path: "/api/health", status: [200], contains: '"ok":true' },
  // Route nội bộ phải từ chối người lạ. Đây là thứ dễ hỏng nhất khi đổi auth.
  { path: "/api/cron/tick", status: [401], contains: null },
  { path: "/api/internal/refund-sweeper", status: [401, 405], contains: null },
];

/** @param {{status: number, body: string}} response */
export function evaluate(check, response) {
  if (!check.status.includes(response.status))
    return `mã ${response.status}, mong đợi ${check.status.join(" hoặc ")}`;
  if (check.contains && !response.body.includes(check.contains))
    return `không thấy "${check.contains}" trong nội dung`;
  return null;
}

async function main() {
  const base = (process.argv[2] || process.env.SMOKE_BASE_URL || "https://aida.vn").replace(/\/$/, "");
  console.log(`Kiểm tra ${base}\n`);
  let failed = 0;

  for (const check of CHECKS) {
    const url = `${base}${check.path}`;
    let problem;
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "aida-smoke/1" },
        signal: AbortSignal.timeout(15000),
      });
      problem = evaluate(check, { status: response.status, body: await response.text() });
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    if (problem) {
      failed += 1;
      console.error(`✗ ${check.path} — ${problem}`);
    } else {
      console.log(`✓ ${check.path}`);
    }
  }

  console.log("");
  if (failed) {
    console.error(`${failed}/${CHECKS.length} mục hỏng.`);
    process.exitCode = 1;
    return;
  }
  console.log(`${CHECKS.length}/${CHECKS.length} mục ổn.`);
}

// Cho phép import để kiểm thử `evaluate` mà không gọi mạng. So bằng đường dẫn
// đầy đủ chứ không bằng tên file: file kiểm thử cũng tên smoke.mjs.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
