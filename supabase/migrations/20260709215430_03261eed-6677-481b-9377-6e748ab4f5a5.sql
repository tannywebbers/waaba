
-- Legacy RPCs used to copy WhatsApp credentials from super user to shared user.
-- With the effective-user model, shared users read the super user's whatsapp_settings
-- directly, so these become safe no-ops.

CREATE OR REPLACE FUNCTION public.copy_super_user_credentials(_super_user_id uuid, _shared_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT; $$;

CREATE OR REPLACE FUNCTION public.remove_shared_credentials(_shared_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT; $$;

GRANT EXECUTE ON FUNCTION public.copy_super_user_credentials(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_shared_credentials(uuid) TO authenticated, service_role;
