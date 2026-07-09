
-- 1) Resolve the effective owner of the WhatsApp connection for a given user.
--    If the user is an active shared user, returns their super_user_id; otherwise returns the user itself.
CREATE OR REPLACE FUNCTION public.get_effective_whatsapp_user_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT super_user_id
       FROM public.shared_inbox_users
      WHERE shared_user_id = _user_id
        AND status = 'active'
      LIMIT 1),
    _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_whatsapp_user_id(uuid) TO authenticated, service_role;

-- 2) Allow active shared users to SELECT their super user's whatsapp_settings row.
DROP POLICY IF EXISTS "Shared users can view super user settings" ON public.whatsapp_settings;
CREATE POLICY "Shared users can view super user settings"
ON public.whatsapp_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.shared_inbox_users s
    WHERE s.super_user_id = whatsapp_settings.user_id
      AND s.shared_user_id = auth.uid()
      AND s.status = 'active'
  )
);

-- 3) Enriched shared-user info (fixes "Unknown" in Shared Inbox settings)
CREATE OR REPLACE FUNCTION public.get_users_info(_ids uuid[])
RETURNS TABLE(user_id uuid, email text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id AS user_id,
    u.email::text AS email,
    COALESCE(p.name, u.raw_user_meta_data->>'name', split_part(u.email::text, '@', 1)) AS name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = ANY(_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_users_info(uuid[]) TO authenticated, service_role;
