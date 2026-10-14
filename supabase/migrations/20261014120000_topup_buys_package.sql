-- Nạp tiền từ hộp "Cần thêm điểm" phải ra điểm, không chỉ ra tiền.
--
-- Hộp đó bán một gói ("Gói X — N điểm"), nhưng xác nhận chuyển khoản chỉ cộng
-- tiền vào ví. Việc tự chuyển điểm khi làm bài chỉ lấy điểm cá nhân sang kênh,
-- không đổi tiền ra điểm, nên người dùng đã trả tiền mà bấm làm lại vẫn bị báo
-- thiếu điểm. Đơn nạp giờ có thể ghi kèm gói cần mua; khi đơn chuyển sang
-- completed (qua webhook ngân hàng hay quản trị duyệt tay, cả hai đều đi qua
-- atomic_confirm_topup), trigger mua gói ngay trong cùng transaction.

ALTER TABLE public.topup_orders
  ADD COLUMN IF NOT EXISTS buy_package_id text,
  ADD COLUMN IF NOT EXISTS buy_points integer CHECK (buy_points IS NULL OR buy_points > 0),
  ADD COLUMN IF NOT EXISTS buy_key uuid;

-- Gói phải đi đủ ba trường; giá gói luôn bằng số tiền của đơn.
ALTER TABLE public.topup_orders DROP CONSTRAINT IF EXISTS topup_orders_buy_package_complete;
ALTER TABLE public.topup_orders ADD CONSTRAINT topup_orders_buy_package_complete CHECK (
  (buy_package_id IS NULL AND buy_points IS NULL AND buy_key IS NULL)
  OR (buy_package_id IS NOT NULL AND buy_points IS NOT NULL AND buy_key IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.topup_orders_buy_package()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  purchase jsonb;
BEGIN
  -- buy_points_idempotent khoá theo buy_key: trigger chạy lại (đơn được xác nhận
  -- hai lần, nhánh already_completed) cũng chỉ mua một lần.
  BEGIN
    purchase := public.buy_points_idempotent(
      NEW.user_id, NEW.buy_key, NEW.buy_package_id, NEW.amount, NEW.buy_points,
      'Mua gói ' || NEW.buy_package_id || ' (' || NEW.buy_points || ' điểm) sau khi nạp'
    );
    IF NOT coalesce((purchase->>'success')::boolean, false) THEN
      RAISE WARNING 'topup % không mua được gói: %', NEW.id, purchase;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Không bao giờ để việc mua gói làm hỏng việc ghi nhận tiền đã chuyển:
    -- rollback ở đây là webhook ngân hàng thử lại mãi và tiền thật không vào ví.
    -- Tiền vẫn nằm trong ví, người dùng mua gói ở trang Ví được.
    RAISE WARNING 'topup % lỗi khi mua gói: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS topup_orders_buy_package ON public.topup_orders;
CREATE TRIGGER topup_orders_buy_package
  AFTER UPDATE OF status ON public.topup_orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.buy_package_id IS NOT NULL)
  EXECUTE FUNCTION public.topup_orders_buy_package();

REVOKE ALL ON FUNCTION public.topup_orders_buy_package() FROM PUBLIC, anon, authenticated;
