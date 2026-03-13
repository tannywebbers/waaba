-- Drop the restrictive policy and add a permissive one for profile search
DROP POLICY IF EXISTS "Users can view accessible profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);