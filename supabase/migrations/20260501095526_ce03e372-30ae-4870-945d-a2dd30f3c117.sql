
-- ============================================================
-- 1) Reply context, reactions, sticker support on messages
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_wamid text,
  ADD COLUMN IF NOT EXISTS reply_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_wamid ON public.messages (reply_to_wamid);
CREATE INDEX IF NOT EXISTS idx_messages_wamid ON public.messages (whatsapp_message_id);

-- ============================================================
-- 2) Stickers library (per-user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text,
  media_url text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/webp',
  source text NOT NULL DEFAULT 'uploaded', -- 'uploaded' | 'saved_from_chat'
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own stickers" ON public.stickers;
CREATE POLICY "Users select own stickers" ON public.stickers FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own stickers" ON public.stickers;
CREATE POLICY "Users insert own stickers" ON public.stickers FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own stickers" ON public.stickers;
CREATE POLICY "Users update own stickers" ON public.stickers FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own stickers" ON public.stickers;
CREATE POLICY "Users delete own stickers" ON public.stickers FOR DELETE USING (auth.uid() = user_id);

-- Stickers bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('stickers', 'stickers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Stickers public read" ON storage.objects;
CREATE POLICY "Stickers public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'stickers');

DROP POLICY IF EXISTS "Users upload own stickers" ON storage.objects;
CREATE POLICY "Users upload own stickers" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'stickers' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own stickers" ON storage.objects;
CREATE POLICY "Users delete own stickers" ON storage.objects FOR DELETE
  USING (bucket_id = 'stickers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- 3) Search users by email (SECURITY DEFINER) — covers users
--    that exist in auth.users but may not have a profile row.
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_users_by_email(_email text)
RETURNS TABLE (user_id uuid, email text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := lower(trim(_email));
BEGIN
  IF q IS NULL OR length(q) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text AS email,
    COALESCE(p.name, u.raw_user_meta_data->>'name', split_part(u.email::text, '@', 1)) AS name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.email IS NOT NULL
    AND (lower(u.email::text) = q OR lower(u.email::text) LIKE '%' || q || '%')
    AND u.id <> auth.uid()
  ORDER BY (lower(u.email::text) = q) DESC, u.created_at ASC
  LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.search_users_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_users_by_email(text) TO authenticated;

-- ============================================================
-- 4) Backfill profiles for any existing auth users missing one
-- ============================================================
INSERT INTO public.profiles (user_id, email, name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL AND u.email IS NOT NULL;
