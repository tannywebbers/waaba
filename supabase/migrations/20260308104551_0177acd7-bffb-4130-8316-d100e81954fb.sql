
CREATE OR REPLACE FUNCTION public.assign_conversation(_contact_id uuid, _super_user_id uuid, _shared_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify the contact belongs to the super user
  IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = _contact_id AND user_id = _super_user_id) THEN
    RAISE EXCEPTION 'Contact not found or not owned by super user';
  END IF;

  -- Verify the shared user is active under this super user
  IF NOT EXISTS (SELECT 1 FROM public.shared_inbox_users WHERE super_user_id = _super_user_id AND shared_user_id = _shared_user_id AND status = 'active') THEN
    RAISE EXCEPTION 'Shared user is not active';
  END IF;

  -- Transfer all messages to the shared user
  UPDATE public.messages SET user_id = _shared_user_id WHERE contact_id = _contact_id AND user_id = _super_user_id;

  -- Transfer chat_labels to the shared user
  UPDATE public.chat_labels SET user_id = _shared_user_id WHERE chat_id = _contact_id AND user_id = _super_user_id;

  -- Transfer contact ownership and set assignment
  UPDATE public.contacts SET user_id = _shared_user_id, assigned_user_id = _shared_user_id WHERE id = _contact_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unassign_conversation(_contact_id uuid, _super_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  -- Get current owner
  SELECT user_id INTO v_current_user_id FROM public.contacts WHERE id = _contact_id;
  
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- Verify the current owner is a shared user of this super user (or already the super user)
  IF v_current_user_id != _super_user_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.shared_inbox_users WHERE super_user_id = _super_user_id AND shared_user_id = v_current_user_id) THEN
      RAISE EXCEPTION 'Not authorized to unassign this contact';
    END IF;
  END IF;

  -- Transfer all messages back to super user
  UPDATE public.messages SET user_id = _super_user_id WHERE contact_id = _contact_id AND user_id = v_current_user_id;

  -- Transfer chat_labels back to super user
  UPDATE public.chat_labels SET user_id = _super_user_id WHERE chat_id = _contact_id AND user_id = v_current_user_id;

  -- Transfer contact back to super user and clear assignment
  UPDATE public.contacts SET user_id = _super_user_id, assigned_user_id = NULL WHERE id = _contact_id;
END;
$$;
