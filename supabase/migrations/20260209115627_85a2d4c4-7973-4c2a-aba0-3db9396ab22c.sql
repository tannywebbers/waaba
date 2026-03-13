
-- Create whatsapp_settings table for storing API credentials per user
CREATE TABLE public.whatsapp_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  api_token text,
  phone_number_id text,
  business_account_id text,
  app_id text,
  webhook_url text,
  verify_token text,
  is_connected boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own settings" ON public.whatsapp_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON public.whatsapp_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON public.whatsapp_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own settings" ON public.whatsapp_settings FOR DELETE USING (auth.uid() = user_id);

-- Create whatsapp_templates table
CREATE TABLE public.whatsapp_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  template_id text NOT NULL,
  name text NOT NULL,
  language text,
  category text,
  status text,
  components jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own templates" ON public.whatsapp_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own templates" ON public.whatsapp_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own templates" ON public.whatsapp_templates FOR DELETE USING (auth.uid() = user_id);

-- Add delete policy for messages (needed for chat clearing)
CREATE POLICY "Users can delete their own messages" ON public.messages FOR DELETE USING (auth.uid() = user_id);

-- Create chat-media storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat-media
CREATE POLICY "Users can upload chat media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view chat media" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');
CREATE POLICY "Users can delete their chat media" ON storage.objects FOR DELETE USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add is_pinned, is_muted, is_archived columns to contacts if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'is_pinned') THEN
    ALTER TABLE public.contacts ADD COLUMN is_pinned boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'is_muted') THEN
    ALTER TABLE public.contacts ADD COLUMN is_muted boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'is_archived') THEN
    ALTER TABLE public.contacts ADD COLUMN is_archived boolean DEFAULT false;
  END IF;
END $$;

-- Add whatsapp_message_id and template fields to messages if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'whatsapp_message_id') THEN
    ALTER TABLE public.messages ADD COLUMN whatsapp_message_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'template_name') THEN
    ALTER TABLE public.messages ADD COLUMN template_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'template_params') THEN
    ALTER TABLE public.messages ADD COLUMN template_params jsonb;
  END IF;
END $$;

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Update trigger for whatsapp_settings
CREATE TRIGGER update_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
