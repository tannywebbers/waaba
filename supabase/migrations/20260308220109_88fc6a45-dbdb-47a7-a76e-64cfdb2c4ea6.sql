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
BEGIN
  -- Only fire for INCOMING messages
  IF NEW.is_outgoing = true THEN
    RETURN NEW;
  END IF;

  -- Get the contact name
  SELECT name INTO v_contact_name
  FROM public.contacts
  WHERE id = NEW.contact_id;

  -- Truncate long messages
  v_body_preview := LEFT(NEW.content, 100);
  IF LENGTH(NEW.content) > 100 THEN
    v_body_preview := v_body_preview || '…';
  END IF;

  -- Send a push to every device the user has registered
  FOR v_token_row IN
    SELECT token
    FROM public.push_tokens
    WHERE user_id = NEW.user_id
  LOOP
    PERFORM net.http_post(
      url     := 'https://dzjaryfngrzcbgefvzpn.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6amFyeWZuZ3J6Y2JnZWZ2enBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTg0NjQsImV4cCI6MjA4NzQ5NDQ2NH0.Svh8lA3NEVGvd_KfBWbthhp7dXz-5WVSOY1plgS95dA'
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