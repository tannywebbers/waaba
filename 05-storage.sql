-- ─────────────────────────────────────────
-- WABA Database Triggers
-- ─────────────────────────────────────────


-- ─────────────────────────────────────────
-- Auto-create profile on new user signup
-- ─────────────────────────────────────────
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────
-- Auto-update updated_at timestamps
-- ─────────────────────────────────────────
CREATE OR REPLACE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_app_templates_updated_at
  BEFORE UPDATE ON public.app_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─────────────────────────────────────────
-- ADDED: Fire push notification whenever a
-- new INCOMING message is inserted.
-- Uses notify_user_on_new_message() defined
-- in functions.sql — must be created first.
-- ─────────────────────────────────────────
DROP TRIGGER IF EXISTS on_new_incoming_message ON public.messages;

CREATE TRIGGER on_new_incoming_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_user_on_new_message();
