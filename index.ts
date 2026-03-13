-- WABA Realtime Configuration

-- Enable realtime for messages table (for live incoming message updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Enable realtime for contacts table (for live online status / contact updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
