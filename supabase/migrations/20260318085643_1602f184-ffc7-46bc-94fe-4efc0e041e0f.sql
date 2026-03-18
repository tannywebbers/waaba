-- Allow users to delete their own webhook logs (needed for "Clear" button)
CREATE POLICY "Users can delete their own webhook logs"
ON public.webhook_logs
FOR DELETE
TO public
USING ((auth.uid())::text = (user_id)::text);

-- Allow anon/service to insert webhook logs (webhook function runs with service role, but also allow authenticated)
CREATE POLICY "Anon can insert webhook logs"
ON public.webhook_logs
FOR INSERT
TO anon
WITH CHECK (true);