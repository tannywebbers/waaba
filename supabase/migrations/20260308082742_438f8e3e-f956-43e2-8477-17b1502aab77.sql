
-- 1. Add assigned_user_id to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_user_id uuid;

-- 2. Create shared_inbox_users table
CREATE TABLE IF NOT EXISTS public.shared_inbox_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_user_id uuid NOT NULL,
  shared_user_id uuid NOT NULL,
  balance integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (super_user_id, shared_user_id)
);

ALTER TABLE public.shared_inbox_users ENABLE ROW LEVEL SECURITY;

-- 3. Security definer functions
CREATE OR REPLACE FUNCTION public.user_can_access_contact(_user_id uuid, _contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE id = _contact_id
    AND (user_id = _user_id OR assigned_user_id = _user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_active_shared_user(_shared_user_id uuid, _super_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_inbox_users
    WHERE shared_user_id = _shared_user_id
    AND super_user_id = _super_user_id
    AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.users_share_inbox(_user_id_1 uuid, _user_id_2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_inbox_users
    WHERE (super_user_id = _user_id_1 AND shared_user_id = _user_id_2)
    OR (super_user_id = _user_id_2 AND shared_user_id = _user_id_1)
  )
$$;

CREATE OR REPLACE FUNCTION public.find_profile_by_email(_email text)
RETURNS TABLE(user_id uuid, name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.name, p.email
  FROM public.profiles p
  WHERE LOWER(p.email) = LOWER(_email)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.deduct_shared_credit(_shared_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance integer;
BEGIN
  UPDATE public.shared_inbox_users
  SET balance = balance - 1
  WHERE shared_user_id = _shared_user_id AND status = 'active' AND balance > 0
  RETURNING balance INTO new_balance;
  
  RETURN COALESCE(new_balance, -1);
END;
$$;

-- 4. shared_inbox_users RLS
CREATE POLICY "Users can view shared inbox" ON public.shared_inbox_users
  FOR SELECT USING (auth.uid() = super_user_id OR auth.uid() = shared_user_id);

CREATE POLICY "Super users can manage shared users insert" ON public.shared_inbox_users
  FOR INSERT WITH CHECK (auth.uid() = super_user_id);

CREATE POLICY "Super users can manage shared users update" ON public.shared_inbox_users
  FOR UPDATE USING (auth.uid() = super_user_id);

CREATE POLICY "Super users can manage shared users delete" ON public.shared_inbox_users
  FOR DELETE USING (auth.uid() = super_user_id);

-- 5. Update contacts RLS
DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts;
CREATE POLICY "Users can view accessible contacts" ON public.contacts
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = assigned_user_id);

DROP POLICY IF EXISTS "Users can insert their own contacts" ON public.contacts;
CREATE POLICY "Users can insert contacts" ON public.contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_active_shared_user(auth.uid(), user_id));

DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contacts;
CREATE POLICY "Users can update accessible contacts" ON public.contacts
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = assigned_user_id);

DROP POLICY IF EXISTS "Users can delete their own contacts" ON public.contacts;
CREATE POLICY "Users can delete accessible contacts" ON public.contacts
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = assigned_user_id);

-- 6. Update messages RLS
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
CREATE POLICY "Users can view accessible messages" ON public.messages
  FOR SELECT USING (auth.uid() = user_id OR public.user_can_access_contact(auth.uid(), contact_id));

DROP POLICY IF EXISTS "Users can insert their own messages" ON public.messages;
CREATE POLICY "Users can insert accessible messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = user_id OR public.user_can_access_contact(auth.uid(), contact_id));

DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
CREATE POLICY "Users can update accessible messages" ON public.messages
  FOR UPDATE USING (auth.uid() = user_id OR public.user_can_access_contact(auth.uid(), contact_id));

DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
CREATE POLICY "Users can delete accessible messages" ON public.messages
  FOR DELETE USING (auth.uid() = user_id OR public.user_can_access_contact(auth.uid(), contact_id));

-- 7. Update account_details RLS for shared users
DROP POLICY IF EXISTS "Users can view account details of their contacts" ON public.account_details;
CREATE POLICY "Users can view account details of accessible contacts" ON public.account_details
  FOR SELECT USING (public.user_can_access_contact(auth.uid(), contact_id));

DROP POLICY IF EXISTS "Users can insert account details for their contacts" ON public.account_details;
CREATE POLICY "Users can insert account details for accessible contacts" ON public.account_details
  FOR INSERT WITH CHECK (public.user_can_access_contact(auth.uid(), contact_id));

DROP POLICY IF EXISTS "Users can update account details of their contacts" ON public.account_details;
CREATE POLICY "Users can update account details of accessible contacts" ON public.account_details
  FOR UPDATE USING (public.user_can_access_contact(auth.uid(), contact_id));

DROP POLICY IF EXISTS "Users can delete account details of their contacts" ON public.account_details;
CREATE POLICY "Users can delete account details of accessible contacts" ON public.account_details
  FOR DELETE USING (public.user_can_access_contact(auth.uid(), contact_id));

-- 8. Update whatsapp_templates RLS to allow shared users to view super user's templates
DROP POLICY IF EXISTS "Users can view their own templates" ON public.whatsapp_templates;
CREATE POLICY "Users can view accessible templates" ON public.whatsapp_templates
  FOR SELECT USING (
    auth.uid() = user_id 
    OR public.is_active_shared_user(auth.uid(), user_id)
  );

-- 9. Update profiles RLS to allow shared inbox members to view each other
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view accessible profiles" ON public.profiles
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.users_share_inbox(auth.uid(), user_id)
  );

-- 10. Update template_mappings RLS for shared users
DROP POLICY IF EXISTS "Users can view their own mappings" ON public.template_mappings;
CREATE POLICY "Users can view accessible mappings" ON public.template_mappings
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.is_active_shared_user(auth.uid(), user_id)
  );

-- 11. Enable realtime for shared_inbox_users
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_inbox_users;
