-- ============================================================================
-- WABA — FULL DATABASE BASELINE (idempotent)
-- Run this on any Supabase project (SQL editor or CLI).
-- Safe to run multiple times: creates tables if missing, adds missing columns
-- to existing tables, (re)creates policies, functions, triggers, indexes,
-- storage buckets/policies and realtime publication membership.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================================
-- 1. TABLES + COLUMNS (create-if-missing, then add-column-if-missing)
-- ============================================================================

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------- apps ----------
CREATE TABLE IF NOT EXISTS public.apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------- contacts ----------
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  loan_id TEXT DEFAULT '',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  amount NUMERIC,
  app_type TEXT DEFAULT 'tloan',
  day_type INTEGER DEFAULT 0,
  avatar_url TEXT,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ,
  is_pinned BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  assigned_user_id UUID,
  is_blocked BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS loan_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS amount NUMERIC,
  ADD COLUMN IF NOT EXISTS app_type TEXT DEFAULT 'tloan',
  ADD COLUMN IF NOT EXISTS day_type INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID,
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- free-form app types / negative day types must stay allowed
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_app_type_check;
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_day_type_check;

-- ---------- messages ----------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  status TEXT NOT NULL DEFAULT 'sent',
  is_outgoing BOOLEAN NOT NULL DEFAULT true,
  media_url TEXT,
  whatsapp_message_id TEXT,
  template_name TEXT,
  template_params JSONB,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  reply_to_wamid TEXT,
  reply_snapshot JSONB,
  reactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_details JSONB,
  error_code INTEGER,
  error_title TEXT,
  error_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
  ADD COLUMN IF NOT EXISTS template_name TEXT,
  ADD COLUMN IF NOT EXISTS template_params JSONB,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID,
  ADD COLUMN IF NOT EXISTS reply_to_wamid TEXT,
  ADD COLUMN IF NOT EXISTS reply_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status_details JSONB,
  ADD COLUMN IF NOT EXISTS error_code INTEGER,
  ADD COLUMN IF NOT EXISTS error_title TEXT,
  ADD COLUMN IF NOT EXISTS error_details TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------- account_details ----------
CREATE TABLE IF NOT EXISTS public.account_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  bank TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- labels / chat_labels ----------
CREATE TABLE IF NOT EXISTS public.labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#25D366',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  chat_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- app_templates ----------
CREATE TABLE IF NOT EXISTS public.app_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- whatsapp_templates ----------
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT,
  category TEXT,
  status TEXT,
  components JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS components JSONB;

-- ---------- template_mappings ----------
CREATE TABLE IF NOT EXISTS public.template_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  variable_number INTEGER NOT NULL,
  mapped_field TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- whatsapp_settings ----------
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  api_token TEXT,
  phone_number_id TEXT,
  business_account_id TEXT,
  app_id TEXT,
  webhook_url TEXT,
  verify_token TEXT,
  is_connected BOOLEAN DEFAULT false,
  last_webhook_hit_at TIMESTAMPTZ,
  last_real_message_at TIMESTAMPTZ,
  last_matched_phone_number_id TEXT,
  last_mapping_failure_reason TEXT,
  webhook_subscription_health TEXT DEFAULT 'unknown',
  webhook_config_warning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS api_token TEXT,
  ADD COLUMN IF NOT EXISTS phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS business_account_id TEXT,
  ADD COLUMN IF NOT EXISTS app_id TEXT,
  ADD COLUMN IF NOT EXISTS webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS verify_token TEXT,
  ADD COLUMN IF NOT EXISTS is_connected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_webhook_hit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_real_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_matched_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS last_mapping_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS webhook_subscription_health TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS webhook_config_warning TEXT;

-- ---------- shared_inbox_users ----------
CREATE TABLE IF NOT EXISTS public.shared_inbox_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_user_id UUID NOT NULL,
  shared_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shared_inbox_users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 0;

-- ---------- push_tokens ----------
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  platform TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS device_info TEXT;

-- ---------- scheduled_messages ----------
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  template_name TEXT,
  template_params JSONB,
  template_language TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS template_name TEXT,
  ADD COLUMN IF NOT EXISTS template_params JSONB,
  ADD COLUMN IF NOT EXISTS template_language TEXT,
  ADD COLUMN IF NOT EXISTS error TEXT;

-- ---------- stickers ----------
CREATE TABLE IF NOT EXISTS public.stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT,
  media_url TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/webp',
  source TEXT NOT NULL DEFAULT 'uploaded',
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- webhook_logs ----------
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  event_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'incoming',
  phone_number TEXT,
  message_type TEXT,
  status TEXT,
  error TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'incoming',
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB;

-- ============================================================================
-- 2. INDEXES / UNIQUE CONSTRAINTS
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS apps_user_name_unique ON public.apps (user_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_user_token_unique ON public.push_tokens (user_id, token);
CREATE INDEX IF NOT EXISTS idx_messages_wamid ON public.messages (whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_wamid ON public.messages (reply_to_wamid);
CREATE INDEX IF NOT EXISTS idx_messages_contact_created ON public.messages (contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_user_phone ON public.contacts (user_id, phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_settings_phone_number_id
  ON public.whatsapp_settings (phone_number_id) WHERE phone_number_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_logs_user_created ON public.webhook_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_inbox_shared_user ON public.shared_inbox_users (shared_user_id, status);

-- ============================================================================
-- 3. GRANTS (Data API access — required, RLS alone is not enough)
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','apps','contacts','messages','account_details','labels','chat_labels',
    'app_templates','whatsapp_templates','template_mappings','whatsapp_settings',
    'shared_inbox_users','push_tokens','scheduled_messages','stickers','webhook_logs'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','apps','contacts','messages','account_details','labels','chat_labels',
    'app_templates','whatsapp_templates','template_mappings','whatsapp_settings',
    'shared_inbox_users','push_tokens','scheduled_messages','stickers','webhook_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- apps
DROP POLICY IF EXISTS "Users manage own apps" ON public.apps;
CREATE POLICY "Users manage own apps" ON public.apps FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- contacts
DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts;
CREATE POLICY "Users can view their own contacts" ON public.contacts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own contacts" ON public.contacts;
CREATE POLICY "Users can insert their own contacts" ON public.contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contacts;
CREATE POLICY "Users can update their own contacts" ON public.contacts FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own contacts" ON public.contacts;
CREATE POLICY "Users can delete their own contacts" ON public.contacts FOR DELETE USING (auth.uid() = user_id);

-- messages
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
CREATE POLICY "Users can view their own messages" ON public.messages FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own messages" ON public.messages;
CREATE POLICY "Users can insert their own messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
CREATE POLICY "Users can update their own messages" ON public.messages FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
CREATE POLICY "Users can delete their own messages" ON public.messages FOR DELETE USING (auth.uid() = user_id);

-- account_details (scoped through owning contact)
DROP POLICY IF EXISTS "Users can view account details of their contacts" ON public.account_details;
CREATE POLICY "Users can view account details of their contacts" ON public.account_details FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert account details for their contacts" ON public.account_details;
CREATE POLICY "Users can insert account details for their contacts" ON public.account_details FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update account details of their contacts" ON public.account_details;
CREATE POLICY "Users can update account details of their contacts" ON public.account_details FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete account details of their contacts" ON public.account_details;
CREATE POLICY "Users can delete account details of their contacts" ON public.account_details FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));

-- labels
DROP POLICY IF EXISTS "Users can view their own labels" ON public.labels;
CREATE POLICY "Users can view their own labels" ON public.labels FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own labels" ON public.labels;
CREATE POLICY "Users can create their own labels" ON public.labels FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own labels" ON public.labels;
CREATE POLICY "Users can update their own labels" ON public.labels FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own labels" ON public.labels;
CREATE POLICY "Users can delete their own labels" ON public.labels FOR DELETE USING (auth.uid() = user_id);

-- chat_labels
DROP POLICY IF EXISTS "Users can view their own chat labels" ON public.chat_labels;
CREATE POLICY "Users can view their own chat labels" ON public.chat_labels FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own chat labels" ON public.chat_labels;
CREATE POLICY "Users can create their own chat labels" ON public.chat_labels FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own chat labels" ON public.chat_labels;
CREATE POLICY "Users can delete their own chat labels" ON public.chat_labels FOR DELETE USING (auth.uid() = user_id);

-- app_templates
DROP POLICY IF EXISTS "Users can view their own app templates" ON public.app_templates;
CREATE POLICY "Users can view their own app templates" ON public.app_templates FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own app templates" ON public.app_templates;
CREATE POLICY "Users can create their own app templates" ON public.app_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own app templates" ON public.app_templates;
CREATE POLICY "Users can update their own app templates" ON public.app_templates FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own app templates" ON public.app_templates;
CREATE POLICY "Users can delete their own app templates" ON public.app_templates FOR DELETE USING (auth.uid() = user_id);

-- whatsapp_templates
DROP POLICY IF EXISTS "Users can view their own templates" ON public.whatsapp_templates;
CREATE POLICY "Users can view their own templates" ON public.whatsapp_templates FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own templates" ON public.whatsapp_templates;
CREATE POLICY "Users can insert their own templates" ON public.whatsapp_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own templates" ON public.whatsapp_templates;
CREATE POLICY "Users can delete their own templates" ON public.whatsapp_templates FOR DELETE USING (auth.uid() = user_id);

-- template_mappings
DROP POLICY IF EXISTS "Users can view their own mappings" ON public.template_mappings;
CREATE POLICY "Users can view their own mappings" ON public.template_mappings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own mappings" ON public.template_mappings;
CREATE POLICY "Users can insert their own mappings" ON public.template_mappings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own mappings" ON public.template_mappings;
CREATE POLICY "Users can update their own mappings" ON public.template_mappings FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own mappings" ON public.template_mappings;
CREATE POLICY "Users can delete their own mappings" ON public.template_mappings FOR DELETE USING (auth.uid() = user_id);

-- whatsapp_settings
DROP POLICY IF EXISTS "Users can view their own settings" ON public.whatsapp_settings;
CREATE POLICY "Users can view their own settings" ON public.whatsapp_settings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.whatsapp_settings;
CREATE POLICY "Users can insert their own settings" ON public.whatsapp_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own settings" ON public.whatsapp_settings;
CREATE POLICY "Users can update their own settings" ON public.whatsapp_settings FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own settings" ON public.whatsapp_settings;
CREATE POLICY "Users can delete their own settings" ON public.whatsapp_settings FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Shared users can view super user settings" ON public.whatsapp_settings;
CREATE POLICY "Shared users can view super user settings" ON public.whatsapp_settings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shared_inbox_users s
    WHERE s.super_user_id = whatsapp_settings.user_id
      AND s.shared_user_id = auth.uid()
      AND s.status = 'active'
  ));

-- shared_inbox_users
DROP POLICY IF EXISTS "Super users can manage shared inbox" ON public.shared_inbox_users;
CREATE POLICY "Super users can manage shared inbox" ON public.shared_inbox_users FOR ALL
  USING (auth.uid() = super_user_id) WITH CHECK (auth.uid() = super_user_id);
DROP POLICY IF EXISTS "Shared users can view their own entry" ON public.shared_inbox_users;
CREATE POLICY "Shared users can view their own entry" ON public.shared_inbox_users FOR SELECT USING (auth.uid() = shared_user_id);

-- push_tokens
DROP POLICY IF EXISTS "Users manage own push tokens" ON public.push_tokens;
CREATE POLICY "Users manage own push tokens" ON public.push_tokens FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- scheduled_messages
DROP POLICY IF EXISTS "Users can view their own scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can view their own scheduled messages" ON public.scheduled_messages FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can create their own scheduled messages" ON public.scheduled_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can update their own scheduled messages" ON public.scheduled_messages FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can delete their own scheduled messages" ON public.scheduled_messages FOR DELETE USING (auth.uid() = user_id);

-- stickers
DROP POLICY IF EXISTS "Users select own stickers" ON public.stickers;
CREATE POLICY "Users select own stickers" ON public.stickers FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own stickers" ON public.stickers;
CREATE POLICY "Users insert own stickers" ON public.stickers FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own stickers" ON public.stickers;
CREATE POLICY "Users update own stickers" ON public.stickers FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own stickers" ON public.stickers;
CREATE POLICY "Users delete own stickers" ON public.stickers FOR DELETE USING (auth.uid() = user_id);

-- webhook_logs
DROP POLICY IF EXISTS "Users can view their own webhook logs" ON public.webhook_logs;
CREATE POLICY "Users can view their own webhook logs" ON public.webhook_logs FOR SELECT USING (auth.uid()::text = user_id::text);
DROP POLICY IF EXISTS "Authenticated can insert webhook logs" ON public.webhook_logs;
CREATE POLICY "Authenticated can insert webhook logs" ON public.webhook_logs FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);
DROP POLICY IF EXISTS "Users can delete their own webhook logs" ON public.webhook_logs;
CREATE POLICY "Users can delete their own webhook logs" ON public.webhook_logs FOR DELETE USING (auth.uid()::text = user_id::text);

-- ============================================================================
-- 5. FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_whatsapp_user_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT super_user_id
       FROM public.shared_inbox_users
      WHERE shared_user_id = _user_id
        AND status = 'active'
      LIMIT 1),
    _user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_users_info(_ids uuid[])
RETURNS TABLE(user_id uuid, email text, name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    u.id AS user_id,
    u.email::text AS email,
    COALESCE(p.name, u.raw_user_meta_data->>'name', split_part(u.email::text, '@', 1)) AS name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = ANY(_ids);
$function$;

CREATE OR REPLACE FUNCTION public.search_users_by_email(_email text)
RETURNS TABLE(user_id uuid, email text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.check_phone_conflict(_phone text, _user_id uuid)
RETURNS TABLE(owner_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.name AS owner_name
  FROM public.contacts c
  JOIN public.profiles p ON p.user_id = c.user_id
  WHERE c.phone = _phone AND c.user_id != _user_id AND c.assigned_user_id IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_shared_credit(_shared_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE public.shared_inbox_users
  SET balance = balance - 1, updated_at = now()
  WHERE shared_user_id = _shared_user_id AND status = 'active' AND balance > 0
  RETURNING balance INTO new_balance;
  RETURN COALESCE(new_balance, -1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.copy_super_user_credentials(_super_user_id uuid, _shared_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ SELECT; $function$;

CREATE OR REPLACE FUNCTION public.remove_shared_credentials(_shared_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ SELECT; $function$;

-- Push notification fan-out on every new INCOMING message.
-- Reads the project URL + service role key from Vault, so no secret is stored
-- in code. Create them once in the target project:
--   select vault.create_secret('https://<project>.supabase.co', 'SUPABASE_URL');
--   select vault.create_secret('<service-role-key>', 'SUPABASE_SERVICE_ROLE_KEY');
CREATE OR REPLACE FUNCTION public.notify_user_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_name TEXT;
  v_token_row    RECORD;
  v_body_preview TEXT;
  v_supabase_url TEXT;
  v_service_key  TEXT;
BEGIN
  IF NEW.is_outgoing = true THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;

    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
    v_service_key  := NULL;
  END;

  v_supabase_url := COALESCE(v_supabase_url, current_setting('app.supabase_url', true));
  v_service_key  := COALESCE(v_service_key,  current_setting('app.service_role_key', true));

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'notify_user_on_new_message: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';
    RETURN NEW;
  END IF;

  SELECT name INTO v_contact_name FROM public.contacts WHERE id = NEW.contact_id;

  v_body_preview := LEFT(NEW.content, 100);
  IF LENGTH(NEW.content) > 100 THEN
    v_body_preview := v_body_preview || '…';
  END IF;

  FOR v_token_row IN
    SELECT token FROM public.push_tokens WHERE user_id = NEW.user_id
  LOOP
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'token', v_token_row.token,
        'title', COALESCE(v_contact_name, 'New Message'),
        'body',  v_body_preview,
        'data',  jsonb_build_object(
                   'contactId', NEW.contact_id::text,
                   'messageId', NEW.id::text
                 )
      )::text
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','apps','contacts','whatsapp_settings','app_templates',
    'push_tokens','scheduled_messages','shared_inbox_users'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS on_new_incoming_message ON public.messages;
CREATE TRIGGER on_new_incoming_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_user_on_new_message();

-- ============================================================================
-- 7. REALTIME
-- ============================================================================
ALTER TABLE public.messages      REPLICA IDENTITY FULL;
ALTER TABLE public.contacts      REPLICA IDENTITY FULL;
ALTER TABLE public.webhook_logs  REPLICA IDENTITY FULL;

DO $$
DECLARE t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY ARRAY['messages','contacts','webhook_logs'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 8. STORAGE BUCKETS + POLICIES
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true), ('stickers', 'stickers', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Chat media is publicly accessible" ON storage.objects;
CREATE POLICY "Chat media is publicly accessible" ON storage.objects FOR SELECT
  USING (bucket_id IN ('chat-media', 'stickers'));

DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('chat-media', 'stickers') AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Authenticated users can update their own chat media" ON storage.objects;
CREATE POLICY "Authenticated users can update their own chat media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('chat-media', 'stickers') AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own chat media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their own chat media" ON storage.objects;
CREATE POLICY "Authenticated users can delete their own chat media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('chat-media', 'stickers') AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- DONE
-- ============================================================================
