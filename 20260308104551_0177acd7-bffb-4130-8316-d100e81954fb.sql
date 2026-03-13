-- Drop the check constraints that block custom app_type and negative day_type values
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_app_type_check;
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_day_type_check;