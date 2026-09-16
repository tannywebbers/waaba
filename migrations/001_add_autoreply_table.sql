-- ============================================================================
-- Migration: Add Auto Reply Settings Table
-- ============================================================================

-- Create auto_replies table
CREATE TABLE IF NOT EXISTS public.auto_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns if table already exists
ALTER TABLE public.auto_replies
  ADD COLUMN IF NOT EXISTS id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_auto_replies_user_id ON public.auto_replies (user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_replies TO authenticated;
GRANT ALL ON public.auto_replies TO service_role;

-- Enable RLS
ALTER TABLE public.auto_replies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can view their own auto replies" ON public.auto_replies;
CREATE POLICY "Users can view their own auto replies" ON public.auto_replies
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own auto replies" ON public.auto_replies;
CREATE POLICY "Users can insert their own auto replies" ON public.auto_replies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own auto replies" ON public.auto_replies;
CREATE POLICY "Users can update their own auto replies" ON public.auto_replies
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own auto replies" ON public.auto_replies;
CREATE POLICY "Users can delete their own auto replies" ON public.auto_replies
  FOR DELETE USING (auth.uid() = user_id);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_auto_replies_updated_at ON public.auto_replies;
CREATE TRIGGER update_auto_replies_updated_at
  BEFORE UPDATE ON public.auto_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
