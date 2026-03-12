ALTER TABLE public.project_transactions
ADD COLUMN IF NOT EXISTS request_id UUID,
ADD COLUMN IF NOT EXISTS ai_action TEXT,
ADD COLUMN IF NOT EXISTS output_kind TEXT,
ADD COLUMN IF NOT EXISTS output_id UUID,
ADD COLUMN IF NOT EXISTS output_url TEXT,
ADD COLUMN IF NOT EXISTS output_title TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_project_transactions_request_id ON public.project_transactions(request_id);
CREATE INDEX IF NOT EXISTS idx_project_transactions_ai_action ON public.project_transactions(ai_action);
