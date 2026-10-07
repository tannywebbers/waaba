-- Add image and bvn fields to contacts
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS bvn TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS image_key TEXT,
ADD COLUMN IF NOT EXISTS image_alt TEXT,
ADD COLUMN IF NOT EXISTS image_uploaded_at TIMESTAMPTZ;

-- Create customer_contacts table (contacts list for each customer)
CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT,
  notes TEXT,
  bank_name TEXT,
  account_number TEXT,
  recipient_name TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  labels TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx ON public.customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS customer_contacts_user_idx ON public.customer_contacts(user_id);

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

DO 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own customer contacts') THEN
    CREATE POLICY "Users can view own customer contacts" ON public.customer_contacts FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own customer contacts') THEN
    CREATE POLICY "Users can insert own customer contacts" ON public.customer_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own customer contacts') THEN
    CREATE POLICY "Users can update own customer contacts" ON public.customer_contacts FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own customer contacts') THEN
    CREATE POLICY "Users can delete own customer contacts" ON public.customer_contacts FOR DELETE USING (auth.uid() = user_id);
  END IF;
END ;
