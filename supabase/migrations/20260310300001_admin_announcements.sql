-- Bảng thông báo hệ thống
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'promo')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on announcements"
  ON public.announcements FOR ALL
  USING (auth.role() = 'service_role');

-- All authenticated users can read active announcements
CREATE POLICY "Authenticated users can read active announcements"
  ON public.announcements FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);
