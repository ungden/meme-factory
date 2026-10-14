/**
 * Nhãn và tông màu cho các trạng thái trong trang quản trị. Trước đây mỗi trang
 * tự viết một chuỗi ba-ngôi `type === "topup" ? … : …` kèm mã màu hex, nên cùng
 * một giao dịch "Hoàn" ở trang này màu xanh dương, ở trang kia lại đỏ.
 */

export type BadgeTone = "success" | "danger" | "warning" | "accent" | "neutral";

export interface Labelled {
  label: string;
  tone: BadgeTone;
}

export function transactionType(type: string): Labelled {
  if (type === "topup") return { label: "Nạp", tone: "success" };
  if (type === "refund") return { label: "Hoàn", tone: "accent" };
  return { label: "Chi", tone: "danger" };
}

export function transactionStatus(status: string): Labelled {
  if (status === "completed") return { label: "Xong", tone: "success" };
  if (status === "failed") return { label: "Hỏng", tone: "danger" };
  return { label: "Đang xử lý", tone: "warning" };
}

export function topupStatus(status: string): Labelled {
  if (status === "completed") return { label: "Đã xác nhận", tone: "success" };
  if (status === "rejected") return { label: "Đã từ chối", tone: "danger" };
  return { label: "Chờ xác nhận", tone: "warning" };
}

const AI_TYPES: Record<string, Labelled> = {
  character: { label: "Nhân vật", tone: "accent" },
  meme: { label: "Meme", tone: "accent" },
  background: { label: "Ảnh nền", tone: "success" },
  refund: { label: "Hoàn điểm", tone: "warning" },
};

export function aiType(type: string): Labelled {
  return AI_TYPES[type] ?? { label: "Khác", tone: "neutral" };
}

const ROLES: Record<string, Labelled> = {
  admin: { label: "Quản trị", tone: "danger" },
  moderator: { label: "Kiểm duyệt", tone: "warning" },
  user: { label: "Người dùng", tone: "neutral" },
};

export function roleLabel(role: string): Labelled {
  return ROLES[role] ?? ROLES.user;
}

/** Số tiền hoặc điểm có dấu: dương là vào ví, âm là ra. */
export function signedTone(amount: number): BadgeTone {
  return amount >= 0 ? "success" : "danger";
}

const ACTION_LABELS: Record<string, string> = {
  meme: "Ảnh meme",
  character: "Ảnh nhân vật",
  background: "Ảnh nền",
  content: "Viết chữ",
  unknown: "Không rõ loại",
};

export function actionLabel(action: string | null): string {
  return ACTION_LABELS[action ?? "unknown"] ?? action ?? ACTION_LABELS.unknown;
}
