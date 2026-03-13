-- WABA Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Contacts
CREATE POLICY "Users can view their own contacts" ON public.contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own contacts" ON public.contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own contacts" ON public.contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own contacts" ON public.contacts FOR DELETE USING (auth.uid() = user_id);

-- Account Details
CREATE POLICY "Users can view account details of their contacts" ON public.account_details FOR SELECT USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert account details for their contacts" ON public.account_details FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can update account details of their contacts" ON public.account_details FOR UPDATE USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can delete account details of their contacts" ON public.account_details FOR DELETE USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = account_details.contact_id AND c.user_id = auth.uid()));

-- Messages
CREATE POLICY "Users can view their own messages" ON public.messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own messages" ON public.messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own messages" ON public.messages FOR DELETE USING (auth.uid() = user_id);

-- WhatsApp Settings
CREATE POLICY "Users can view their own settings" ON public.whatsapp_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON public.whatsapp_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON public.whatsapp_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own settings" ON public.whatsapp_settings FOR DELETE USING (auth.uid() = user_id);

-- WhatsApp Templates
CREATE POLICY "Users can view their own templates" ON public.whatsapp_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own templates" ON public.whatsapp_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own templates" ON public.whatsapp_templates FOR DELETE USING (auth.uid() = user_id);

-- App Templates
CREATE POLICY "Users can view their own app templates" ON public.app_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own app templates" ON public.app_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own app templates" ON public.app_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own app templates" ON public.app_templates FOR DELETE USING (auth.uid() = user_id);

-- Template Mappings
CREATE POLICY "Users can view their own mappings" ON public.template_mappings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own mappings" ON public.template_mappings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own mappings" ON public.template_mappings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own mappings" ON public.template_mappings FOR DELETE USING (auth.uid() = user_id);

-- Labels
CREATE POLICY "Users can view their own labels" ON public.labels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own labels" ON public.labels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own labels" ON public.labels FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own labels" ON public.labels FOR DELETE USING (auth.uid() = user_id);

-- Chat Labels
CREATE POLICY "Users can view their own chat labels" ON public.chat_labels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own chat labels" ON public.chat_labels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own chat labels" ON public.chat_labels FOR DELETE USING (auth.uid() = user_id);

-- Push Tokens
CREATE POLICY "Users can view their own push tokens" ON public.push_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own push tokens" ON public.push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own push tokens" ON public.push_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own push tokens" ON public.push_tokens FOR DELETE USING (auth.uid() = user_id);
