-- Enable REPLICA IDENTITY FULL so realtime UPDATE events include all columns (old + new)
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.contacts REPLICA IDENTITY FULL;