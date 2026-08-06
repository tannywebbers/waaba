
-- Allow shared users to delete their own membership (leave shared inbox)
DROP POLICY IF EXISTS "Super users can manage shared users delete" ON public.shared_inbox_users;
CREATE POLICY "Users can delete shared inbox membership"
ON public.shared_inbox_users
FOR DELETE
USING (auth.uid() = super_user_id OR auth.uid() = shared_user_id);
