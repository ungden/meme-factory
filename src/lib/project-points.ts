/**
 * Trừ điểm cho một lượt tạo nội dung, tự chuyển điểm cá nhân sang ví dự án khi
 * cần.
 *
 * Hệ thống có hai ví: điểm cá nhân (nạp bằng tiền) và điểm của từng dự án. Đó
 * là cấu trúc đúng cho dự án nhóm, nhưng người dùng một mình thì không có lý do
 * gì phải học nó: họ nạp tiền, thấy số dư, rồi bị báo "ví dự án không đủ điểm"
 * trong khi tài khoản còn nguyên điểm. Ở đây hợp nhất hai ví thành một trải
 * nghiệm: thiếu bao nhiêu thì chuyển đúng bấy nhiêu rồi trừ tiếp.
 *
 * Chỉ chủ dự án mới chuyển được (RPC nạp ví dự án đòi đúng chủ sở hữu), nên với
 * thành viên được mời thì vẫn báo thiếu như cũ — tiền của họ không được tiêu cho
 * dự án người khác mà không hỏi.
 */

export type PointsRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type SpendInput = {
  projectId: string;
  /** Chủ dự án — người duy nhất có thể chuyển điểm cá nhân vào ví dự án. */
  projectOwnerId: string;
  actorUserId: string;
  cost: number;
  description: string;
  requestId: string;
  aiAction?: string;
  metadata?: Record<string, unknown>;
  /** Tên dự án, chỉ dùng cho mô tả giao dịch chuyển điểm. */
  projectName?: string;
};

export type SpendResult =
  | { ok: true; projectPoints: number; toppedUp: number; transactionId?: string }
  | { ok: false; code: "INSUFFICIENT_POINTS"; required: number; available: number; canTopUp: boolean }
  | { ok: false; code: "FAILED"; message: string };

type RpcPayload = {
  success?: boolean;
  error?: string;
  points?: number;
  user_points?: number;
  project_points?: number;
  transaction_id?: string;
};

async function call(rpc: PointsRpc, name: string, args: Record<string, unknown>): Promise<RpcPayload> {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return (data || {}) as RpcPayload;
}

function deductArgs(input: SpendInput) {
  return {
    _project_id: input.projectId,
    _actor_user_id: input.actorUserId,
    _cost: input.cost,
    _description: input.description,
    _request_id: input.requestId,
    _ai_action: input.aiAction ?? null,
    _metadata: input.metadata ?? null,
  };
}

export async function spendProjectPoints(rpc: PointsRpc, input: SpendInput): Promise<SpendResult> {
  if (input.cost <= 0) return { ok: true, projectPoints: 0, toppedUp: 0 };

  try {
    const first = await call(rpc, "atomic_deduct_project_points", deductArgs(input));
    if (first.success)
      return {
        ok: true,
        projectPoints: Number(first.points ?? 0),
        toppedUp: 0,
        transactionId: first.transaction_id,
      };

    const projectPoints = Number(first.points ?? 0);
    const isOwner = input.actorUserId === input.projectOwnerId;
    if (first.error !== "Insufficient project points" || !isOwner)
      return {
        ok: false,
        code: "INSUFFICIENT_POINTS",
        required: input.cost,
        available: projectPoints,
        canTopUp: false,
      };

    const shortfall = input.cost - projectPoints;
    const moved = await call(rpc, "atomic_deposit_points_to_project", {
      _project_id: input.projectId,
      _owner_user_id: input.projectOwnerId,
      _points_to_deposit: shortfall,
      _description: input.projectName
        ? `Tự chuyển điểm sang dự án ${input.projectName}`
        : "Tự chuyển điểm sang ví dự án",
    });

    if (!moved.success)
      return {
        ok: false,
        code: "INSUFFICIENT_POINTS",
        required: input.cost,
        // Tổng số điểm người dùng thực sự có: ví dự án cộng ví cá nhân.
        available: projectPoints + Number(moved.points ?? 0),
        canTopUp: true,
      };

    const second = await call(rpc, "atomic_deduct_project_points", deductArgs(input));
    if (!second.success)
      return {
        ok: false,
        code: "INSUFFICIENT_POINTS",
        required: input.cost,
        available: Number(second.points ?? 0),
        canTopUp: true,
      };

    return {
      ok: true,
      projectPoints: Number(second.points ?? 0),
      toppedUp: shortfall,
      transactionId: second.transaction_id,
    };
  } catch (error) {
    return { ok: false, code: "FAILED", message: error instanceof Error ? error.message : "Lỗi trừ điểm" };
  }
}

export type EnsureInput = {
  projectId: string;
  projectOwnerId: string;
  /** Người khởi động việc này; chỉ chủ dự án mới được tự chuyển điểm. */
  actorUserId: string;
  /** Số điểm ví dự án đang có. */
  currentPoints: number;
  needed: number;
  projectName?: string;
};

/**
 * Nạp trước cho ví dự án đủ tiêu cho một việc sắp làm.
 *
 * Dùng cho phim: điểm bị trừ bên trong một hàm SQL (`accept_film_quote`) nên
 * không chèn được bước chuyển ví vào giữa. Gọi hàm này ngay trước đó cho cùng
 * một kết quả: người dùng có đủ điểm trong tài khoản thì việc chạy tiếp.
 */
export async function ensureProjectPoints(
  rpc: PointsRpc,
  input: EnsureInput,
): Promise<{ ok: true; toppedUp: number } | { ok: false; available: number }> {
  const shortfall = input.needed - input.currentPoints;
  if (shortfall <= 0) return { ok: true, toppedUp: 0 };
  if (input.actorUserId !== input.projectOwnerId) return { ok: false, available: input.currentPoints };

  try {
    const moved = await call(rpc, "atomic_deposit_points_to_project", {
      _project_id: input.projectId,
      _owner_user_id: input.projectOwnerId,
      _points_to_deposit: shortfall,
      _description: input.projectName
        ? `Tự chuyển điểm sang dự án ${input.projectName}`
        : "Tự chuyển điểm sang ví dự án",
    });
    if (!moved.success)
      return { ok: false, available: input.currentPoints + Number(moved.points ?? 0) };
    return { ok: true, toppedUp: shortfall };
  } catch {
    // Chuyển điểm hỏng thì để bước trừ điểm phía sau báo thiếu như bình thường.
    return { ok: false, available: input.currentPoints };
  }
}
