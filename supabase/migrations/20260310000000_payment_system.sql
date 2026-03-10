-- ============================================
-- PAYMENT SYSTEM: Wallets, Transactions, Topup Orders
-- ============================================

-- Wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_wallet UNIQUE (user_id)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topup', 'payment', 'refund')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Topup Orders table
CREATE TABLE IF NOT EXISTS public.topup_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_topup_orders_user_id ON public.topup_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_topup_orders_status ON public.topup_orders(status);

-- RLS Policies
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topup_orders ENABLE ROW LEVEL SECURITY;

-- Wallets: users can view own wallet
CREATE POLICY "Users can view own wallet" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);

-- Transactions: users can view own transactions
CREATE POLICY "Users can view own transactions" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Topup Orders: users can view own orders
CREATE POLICY "Users can view own topup orders" ON public.topup_orders
  FOR SELECT USING (auth.uid() = user_id);

-- Service role bypass (for webhook/server operations)
CREATE POLICY "Service role full access wallets" ON public.wallets
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access transactions" ON public.transactions
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access topup_orders" ON public.topup_orders
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-create wallet on user signup (trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id, balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_wallet'
  ) THEN
    CREATE TRIGGER on_auth_user_created_wallet
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_wallet();
  END IF;
END;
$$;

-- RPC function to find pending topup by ID prefix (for webhook matching)
CREATE OR REPLACE FUNCTION get_pending_topup_by_id_prefix(_prefix text)
RETURNS TABLE(id uuid, status text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, status
  FROM topup_orders
  WHERE id::text LIKE (_prefix || '%')
    AND status = 'pending'
  LIMIT 1;
$$;

-- Create wallet for existing admin user
INSERT INTO public.wallets (user_id, balance)
VALUES ('3d3a86e2-2161-42a0-92e7-4dedea03be22', 0)
ON CONFLICT (user_id) DO NOTHING;
