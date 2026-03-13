
-- Fix overly permissive storage policies
DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat media" ON storage.objects;

CREATE POLICY "Authenticated users can upload chat media" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Authenticated users can delete their own chat media" ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-media');

-- Fix webhook_logs insert policy to be scoped to service role only
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON storage.objects;
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.webhook_logs;

CREATE POLICY "Authenticated can insert webhook logs" ON public.webhook_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = user_id::text);
