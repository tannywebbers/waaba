-- =====================================================
-- PUSH NOTIFICATIONS TABLE MIGRATION
-- Run this in Supabase SQL Editor
-- =====================================================

-- Create push_tokens table for managing device push subscriptions
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Web Push API fields
  endpoint TEXT,
  keys JSONB, -- Contains p256dh and auth keys
  
  -- FCM fields
  fcm_token TEXT,
  
  -- Device info
  device_type TEXT CHECK (device_type IN ('android', 'ios', 'web')),
  device_name TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one token per device
  UNIQUE(user_id, device_type, endpoint)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_fcm ON push_tokens(fcm_token) WHERE fcm_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_tokens_endpoint ON push_tokens(endpoint) WHERE endpoint IS NOT NULL;

-- RLS Policies
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tokens
CREATE POLICY "Users can view own push tokens" ON push_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own tokens
CREATE POLICY "Users can insert own push tokens" ON push_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own tokens
CREATE POLICY "Users can update own push tokens" ON push_tokens
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete own push tokens" ON push_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can access all tokens (for webhook sending)
CREATE POLICY "Service role full access" ON push_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_token_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
CREATE TRIGGER update_push_token_timestamp
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_token_timestamp();

-- =====================================================
-- WEBHOOK HELPER FUNCTION
-- Use this in your webhook to send push notifications
-- =====================================================

CREATE OR REPLACE FUNCTION send_push_notification(
  target_user_id UUID,
  notification_title TEXT,
  notification_body TEXT,
  notification_data JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB AS $$
DECLARE
  tokens_to_notify RECORD;
  result JSONB;
BEGIN
  -- Get all active push tokens for user
  FOR tokens_to_notify IN 
    SELECT * FROM push_tokens 
    WHERE user_id = target_user_id
  LOOP
    -- Store notification payload
    -- Your webhook will read this and send via FCM/Web Push
    INSERT INTO push_notifications_queue (
      user_id,
      push_token_id,
      title,
      body,
      data,
      status
    ) VALUES (
      target_user_id,
      tokens_to_notify.id,
      notification_title,
      notification_body,
      notification_data,
      'pending'
    );
  END LOOP;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PUSH NOTIFICATIONS QUEUE TABLE
-- Stores notifications to be sent by webhook
-- =====================================================

CREATE TABLE IF NOT EXISTS push_notifications_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  push_token_id UUID REFERENCES push_tokens(id) ON DELETE CASCADE NOT NULL,
  
  -- Notification content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT DEFAULT '/pwa-192x192.png',
  data JSONB DEFAULT '{}'::JSONB,
  
  -- Status tracking
  status TEXT CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
  error_message TEXT,
  attempts INT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  sent_at TIMESTAMPTZ,
  
  -- Prevent duplicate notifications
  UNIQUE(user_id, created_at, title, body)
);

CREATE INDEX IF NOT EXISTS idx_push_queue_pending ON push_notifications_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_push_queue_user ON push_notifications_queue(user_id);

-- =====================================================
-- CLEANUP OLD NOTIFICATIONS (RUN WEEKLY)
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_push_notifications()
RETURNS void AS $$
BEGIN
  -- Delete notifications older than 7 days
  DELETE FROM push_notifications_queue
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  -- Delete inactive push tokens (not used in 90 days)
  DELETE FROM push_tokens
  WHERE last_used_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT ALL ON push_tokens TO service_role;
GRANT ALL ON push_notifications_queue TO service_role;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Test that tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('push_tokens', 'push_notifications_queue');

-- Should return 2 rows
