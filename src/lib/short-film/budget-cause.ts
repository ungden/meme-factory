import { errorCode } from "@/lib/error-messages";

/**
 * Tập phim dừng ở "budget_blocked" vì một trong hai lý do rất khác nhau: kênh
 * thật sự hết điểm (phải nạp), hoặc tập chạm mức chi chính người dùng đặt (phải
 * nâng mức). Studio từng luôn mời "Nâng lên…", nên người hết điểm nâng mức mãi
 * mà phim vẫn đứng.
 *
 * Cùng quy tắc với `filmBudgetCause` trong notifications.ts (chuông báo).
 */
export function filmBudgetCause(error: string | null | undefined): "wallet" | "cap" {
  return errorCode(error) === "INSUFFICIENT_POINTS" ? "wallet" : "cap";
}
