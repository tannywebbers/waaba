
-- Function to copy super user's WhatsApp credentials to a shared user
CREATE OR REPLACE FUNCTION public.copy_super_user_credentials(_super_user_id uuid, _shared_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings RECORD;
  v_webhook_url TEXT;
  v_verify_token TEXT;
  v_supabase_url TEXT := 'https://dzjaryfngrzcbgefvzpn.supabase.co';
BEGIN
  -- Get super user's credentials
  SELECT api_token, phone_number_id, business_account_id, app_id
  INTO v_settings
  FROM public.whatsapp_settings
  WHERE user_id = _super_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Super user has no WhatsApp settings configured';
  END IF;

  -- Generate webhook URL and verify token for shared user
  v_webhook_url := v_supabase_url || '/functions/v1/whatsapp-webhook?user_id=' || _shared_user_id::text;
  v_verify_token := 'waba_shared_' || substr(md5(random()::text), 1, 20);

  -- Upsert shared user's settings with super user's credentials
  INSERT INTO public.whatsapp_settings (user_id, api_token, phone_number_id, business_account_id, app_id, webhook_url, verify_token, is_connected)
  VALUES (_shared_user_id, v_settings.api_token, v_settings.phone_number_id, v_settings.business_account_id, v_settings.app_id, v_webhook_url, v_verify_token, true)
  ON CONFLICT (user_id) DO UPDATE SET
    api_token = EXCLUDED.api_token,
    phone_number_id = EXCLUDED.phone_number_id,
    business_account_id = EXCLUDED.business_account_id,
    app_id = EXCLUDED.app_id,
    webhook_url = EXCLUDED.webhook_url,
    verify_token = EXCLUDED.verify_token,
    is_connected = true,
    updated_at = now();
END;
$$;

-- Function to remove shared user's copied credentials
CREATE OR REPLACE FUNCTION public.remove_shared_credentials(_shared_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.whatsapp_settings
  WHERE user_id = _shared_user_id;
END;
$$;

-- Add unique constraint on user_id for whatsapp_settings to support upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_settings_user_id_key'
  ) THEN
    ALTER TABLE public.whatsapp_settings ADD CONSTRAINT whatsapp_settings_user_id_key UNIQUE (user_id);
  END IF;
END;
$$;
