
-- Template variable mappings table
CREATE TABLE public.template_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  variable_number INTEGER NOT NULL,
  mapped_field TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, template_name, variable_number)
);

ALTER TABLE public.template_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mappings" ON public.template_mappings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own mappings" ON public.template_mappings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own mappings" ON public.template_mappings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own mappings" ON public.template_mappings FOR DELETE USING (auth.uid() = user_id);
