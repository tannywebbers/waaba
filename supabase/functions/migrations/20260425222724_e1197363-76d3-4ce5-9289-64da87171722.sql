ALTER TABLE public.whatsapp_settings
ADD COLUMN IF NOT EXISTS last_webhook_hit_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_real_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_matched_phone_number_id TEXT,
ADD COLUMN IF NOT EXISTS last_mapping_failure_reason TEXT,
ADD COLUMN IF NOT EXISTS webhook_subscription_health TEXT DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS webhook_config_warning TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_settings_phone_number_id
ON public.whatsapp_settings (phone_number_id)
WHERE phone_number_id IS NOT NULL;