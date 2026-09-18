import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Xác thực các route nội bộ (worker Railway, cron Vercel) bằng VIDEO_WORKER_TOKEN.
 *
 * So sánh bằng `timingSafeEqual`: token là bí mật dùng lại nhiều lần, so sánh
 * bằng `!==` rò rỉ độ dài tiền tố trùng qua thời gian phản hồi.
 */
export function tokenMatches(presented: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !presented) return false;
  // Băm trước để hai vế luôn cùng độ dài: `timingSafeEqual` ném lỗi khi lệch,
  // mà trả về sớm vì lệch độ dài cũng đã là một kênh rò rỉ.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/** Header `Authorization: Bearer <token>` của worker/cron nội bộ. */
export function authorizeInternal(request: Request): boolean {
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return tokenMatches(presented, process.env.VIDEO_WORKER_TOKEN);
}

/**
 * Cron của Vercel gửi `Authorization: Bearer $CRON_SECRET`. Chấp nhận cả token
 * worker để gọi tay khi cần diễn tập sự cố.
 */
export function authorizeCron(request: Request): boolean {
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return (
    tokenMatches(presented, process.env.CRON_SECRET) ||
    tokenMatches(presented, process.env.VIDEO_WORKER_TOKEN)
  );
}
