-- Một chữ ký duy nhất cho RPC tạo lượt sản xuất.
--
-- Bản chuẩn là public.create_film_production_run_v2(
--   uuid,uuid,integer,uuid,integer,text,integer,integer,uuid,text,date,text,jsonb
-- ) — tham số p_guests có giá trị mặc định, nên schedule_due_film_automations
-- gọi bằng 12 đối số vẫn phân giải đúng vào chữ ký 13 đối số này.
--
-- Migration 20260915183000 đã bỏ overload _v2 12 đối số vì PostgREST coi lời
-- gọi là mơ hồ khi có payload khách mời. Bản legacy 11 đối số không có tiền tố
-- _v2 lại bị bỏ sót. Nó không biết tới video_model lẫn guests, nên nếu có ai
-- gọi trúng, lượt sản xuất sẽ được tạo mà không qua kiểm tra INVALID_VIDEO_MODEL
-- và mang mặc định từ trước thời Seedance. Lời gọi cuối cùng trong migration đã
-- biến mất khi schedule_due_film_automations chuyển sang _v2.
--
-- ĐỪNG thêm lại overload mới: mọi tham số mới phải có giá trị mặc định trên
-- chính chữ ký 13 đối số ở trên.
drop function if exists public.create_film_production_run(
  uuid,uuid,integer,uuid,integer,text,integer,integer,uuid,text,date
);

-- Quét task đã được chấp nhận của một tập phim mà không phải đọc toàn bộ lịch
-- sử. tasksForPlan lấy 250 bản ghi mới nhất; với một tập tạo lại nhiều lần,
-- một task ĐÃ DUYỆT có thể rơi khỏi trang đó, khiến hệ thống mua lại đúng thứ
-- người dùng đã trả tiền. Index này phục vụ truy vấn bù chỉ lấy task đã duyệt.
create index if not exists short_film_plan_accepted
  on public.short_film_tasks(plan_id, created_at desc)
  where approved_at is not null or auto_accepted_at is not null;

-- follows_previous không còn được ghi: phim ngắn dùng bộ ảnh tham chiếu thay vì
-- lấy khung cuối của clip trước. Giữ cột cho dữ liệu cũ, đánh dấu đã ngừng dùng.
comment on column public.video_plan_scenes.follows_previous is
  'Đã ngừng dùng từ 20260913183000: phim ngắn dùng reference images, không lấy khung cuối clip trước. Luôn false với bản ghi mới.';

select pg_notify('pgrst','reload schema');
