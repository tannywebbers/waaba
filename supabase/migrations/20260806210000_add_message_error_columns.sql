-- Meta's status webhook sends a real error (code/title/details) whenever a
-- message status is "failed". The webhook handler was discarding it, so
-- template failures showed up as a bare "failed" with no way to diagnose why.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS error_code integer,
  ADD COLUMN IF NOT EXISTS error_title text,
  ADD COLUMN IF NOT EXISTS error_details text;
