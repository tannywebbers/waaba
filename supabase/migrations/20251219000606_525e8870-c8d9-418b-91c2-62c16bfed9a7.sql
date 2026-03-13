-- Add app_type and day_type columns to contacts table
ALTER TABLE public.contacts 
ADD COLUMN app_type TEXT DEFAULT 'tloan',
ADD COLUMN day_type INTEGER DEFAULT 0;

-- Add constraint to validate app_type
ALTER TABLE public.contacts 
ADD CONSTRAINT contacts_app_type_check CHECK (app_type IN ('tloan', 'quickash'));

-- Add constraint to validate day_type
ALTER TABLE public.contacts 
ADD CONSTRAINT contacts_day_type_check CHECK (day_type IN (-1, 0));