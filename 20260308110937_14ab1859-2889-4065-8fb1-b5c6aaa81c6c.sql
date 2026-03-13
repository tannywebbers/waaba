
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add platform column to push_tokens
ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS platform TEXT;

-- Add unique constraint for user_id + token (skip if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_user_token_unique'
  ) THEN
    ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_user_token_unique UNIQUE (user_id, token);
  END IF;
END $$;

-- Create the notify function that calls send-push edge function
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
  v_supabase_url TEXT := 'https://dzjaryfngrzcbgefvzpn.supabase.co';
  v_service_key  TEXT;
BEGIN
  -- Only fire for INCOMING messages
  IF NEW.is_outgoing = true THEN
    RETURN NEW;
  END IF;

  -- Get service role key from vault
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RAISE WARNING 'notify_user_on_new_message: no service role key found in vault';
    RETURN NEW;
  END IF;

  SELECT name INTO v_contact_name
  FROM public.contacts
  WHERE id = NEW.contact_id;

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

-- Create trigger
DROP TRIGGER IF EXISTS on_new_incoming_message ON public.messages;

CREATE TRIGGER on_new_incoming_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_user_on_new_message();
