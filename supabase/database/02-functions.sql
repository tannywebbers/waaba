-- ─────────────────────────────────────────
-- WABA Database Functions
-- ─────────────────────────────────────────


-- ─────────────────────────────────────────
-- Creates a profile row when a new user
-- signs up via Supabase Auth
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  RETURN new;
END;
$function$;


-- ─────────────────────────────────────────
-- Automatically updates the updated_at
-- column on any table that uses this trigger
-- ─────────────────────────────────────────
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


-- ─────────────────────────────────────────
-- ADDED: Fires on every new incoming message
-- (is_outgoing = false) and sends a push
-- notification to all of the user's devices
-- via the send-push Edge Function
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_user_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_name TEXT;
  v_token_row    RECORD;
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_body_preview TEXT;
BEGIN
  -- Only fire for INCOMING messages — ignore anything the user sent
  IF NEW.is_outgoing = true THEN
    RETURN NEW;
  END IF;

  -- Get the contact name for the notification title
  SELECT name INTO v_contact_name
  FROM public.contacts
  WHERE id = NEW.contact_id;

  -- Truncate long messages to 100 chars for the notification body
  v_body_preview := LEFT(NEW.content, 100);
  IF LENGTH(NEW.content) > 100 THEN
    v_body_preview := v_body_preview || '…';
  END IF;

  -- Read Supabase URL and service role key set in tables.sql
  v_supabase_url := current_setting('app.supabase_url',    true);
  v_service_key  := current_setting('app.service_role_key', true);

  -- Send a push to every device the user has registered
  FOR v_token_row IN
    SELECT token
    FROM public.push_tokens
    WHERE user_id = NEW.user_id
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
