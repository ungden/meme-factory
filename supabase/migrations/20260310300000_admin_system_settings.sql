-- Bảng cấu hình hệ thống (key-value store)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Chỉ service_role hoặc admin có quyền
CREATE POLICY "Service role full access on system_settings"
  ON public.system_settings FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read system_settings"
  ON public.system_settings FOR SELECT
  USING (auth.role() = 'authenticated');
