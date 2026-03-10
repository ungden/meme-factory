-- Schema fixes: CHECK constraint, status column, free_trial_claimed, reference_id
ALTER TABLE wallets ADD CONSTRAINT check_points_non_negative CHECK (points >= 0);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed'));
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS free_trial_claimed BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_id TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON transactions(reference_id);
