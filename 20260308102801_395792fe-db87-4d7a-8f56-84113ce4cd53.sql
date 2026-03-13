-- Ensure app_templates exists even when earlier migration was skipped
CREATE TABLE IF NOT EXISTS public.app_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_templates' AND policyname = 'Users can view their own app templates'
  ) THEN
    CREATE POLICY "Users can view their own app templates"
      ON public.app_templates FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_templates' AND policyname = 'Users can create their own app templates'
  ) THEN
    CREATE POLICY "Users can create their own app templates"
      ON public.app_templates FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_templates' AND policyname = 'Users can update their own app templates'
  ) THEN
    CREATE POLICY "Users can update their own app templates"
      ON public.app_templates FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_templates' AND policyname = 'Users can delete their own app templates'
  ) THEN
    CREATE POLICY "Users can delete their own app templates"
      ON public.app_templates FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
