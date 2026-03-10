-- ============================================
-- Migration: Add Points System to Wallets
-- Adds points column for AI generation credits
-- ============================================

-- Add points column to wallets table
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;

-- Create index for points queries
CREATE INDEX IF NOT EXISTS idx_wallets_points ON wallets(points);

-- Comment for documentation
COMMENT ON COLUMN wallets.points IS 'AI generation credits. Character=3pts, Background=4pts, Meme=5pts. New users get 5 free points.';
