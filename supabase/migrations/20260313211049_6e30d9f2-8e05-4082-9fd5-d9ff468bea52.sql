
-- Extension for push notification triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  loan_id TEXT NOT NULL,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own contacts" ON public.contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own contacts" ON public.contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own contacts" ON public.contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own contacts" ON public.contacts FOR DELETE USING (auth.uid() = user_id);

-- Account Details
CREATE TABLE IF NOT EXISTS public.account_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  bank TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.account_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view account details of their contacts" ON public.account_details FOR SELECT USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert account details for their contacts" ON public.account_details FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can update account details of their contacts" ON public.account_details FOR UPDATE USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can delete account details of their contacts" ON public.account_details FOR DELETE USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));

-- Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own messages" ON public.messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own messages" ON public.messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own messages" ON public.messages FOR DELETE USING (auth.uid() = user_id);

-- WhatsApp Settings
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  api_token TEXT,
  phone_number_id TEXT,
  business_account_id TEXT,
  app_id TEXT,
  webhook_url TEXT,
  verify_token TEXT,
  is_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own settings" ON public.whatsapp_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON public.whatsapp_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON public.whatsapp_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own settings" ON public.whatsapp_settings FOR DELETE USING (auth.uid() = user_id);

-- WhatsApp Templates
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT,
  category TEXT,
  status TEXT,
  components JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own templates" ON public.whatsapp_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own templates" ON public.whatsapp_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own templates" ON public.whatsapp_templates FOR DELETE USING (auth.uid() = user_id);

-- App Templates
CREATE TABLE IF NOT EXISTS public.app_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own app templates" ON public.app_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own app templates" ON public.app_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own app templates" ON public.app_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own app templates" ON public.app_templates FOR DELETE USING (auth.uid() = user_id);

-- Template Mappings
CREATE TABLE IF NOT EXISTS public.template_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  variable_number INTEGER NOT NULL,
  mapped_field TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.template_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own mappings" ON public.template_mappings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own mappings" ON public.template_mappings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own mappings" ON public.template_mappings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own mappings" ON public.template_mappings FOR DELETE USING (auth.uid() = user_id);

-- Labels
CREATE TABLE IF NOT EXISTS public.labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#25D366',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own labels" ON public.labels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own labels" ON public.labels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own labels" ON public.labels FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own labels" ON public.labels FOR DELETE USING (auth.uid() = user_id);

-- Chat Labels
CREATE TABLE IF NOT EXISTS public.chat_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  chat_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own chat labels" ON public.chat_labels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own chat labels" ON public.chat_labels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own chat labels" ON public.chat_labels FOR DELETE USING (auth.uid() = user_id);

-- Push Tokens
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  platform TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_user_token_unique UNIQUE (user_id, token)
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own push tokens" ON public.push_tokens FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Shared Inbox Users
CREATE TABLE IF NOT EXISTS public.shared_inbox_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  super_user_id UUID NOT NULL,
  shared_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shared_inbox_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super users can manage shared inbox" ON public.shared_inbox_users FOR ALL USING (auth.uid() = super_user_id) WITH CHECK (auth.uid() = super_user_id);
CREATE POLICY "Shared users can view their own entry" ON public.shared_inbox_users FOR SELECT USING (auth.uid() = shared_user_id);

-- Webhook Logs
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own webhook logs" ON public.webhook_logs FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Service role can insert webhook logs" ON public.webhook_logs FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;

-- Functions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_shared_credit(_shared_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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

CREATE OR REPLACE FUNCTION public.check_phone_conflict(_phone TEXT, _user_id UUID)
RETURNS TABLE(owner_name TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  RETURN QUERY
  SELECT p.name AS owner_name
  FROM public.contacts c
  JOIN public.profiles p ON p.user_id = c.user_id
  WHERE c.phone = _phone AND c.user_id != _user_id AND c.assigned_user_id IS NOT NULL;
END;
$function$;

-- Triggers
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_app_templates_updated_at
  BEFORE UPDATE ON public.app_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload chat media" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Chat media is publicly accessible" ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

CREATE POLICY "Users can delete their own chat media" ON storage.objects FOR DELETE
USING (bucket_id = 'chat-media');
