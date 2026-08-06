CREATE OR REPLACE FUNCTION public.check_phone_conflict(_phone text, _user_id uuid)
 RETURNS TABLE(owner_user_id uuid, owner_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  raw_phone text;
  phone_variants text[];
  my_oldest_created timestamptz;
BEGIN
  raw_phone := regexp_replace(_phone, '[^\d]', '', 'g');
  phone_variants := ARRAY[_phone, raw_phone, '+' || raw_phone];
  IF raw_phone LIKE '234%' AND length(raw_phone) = 13 THEN
    phone_variants := phone_variants || ('0' || substring(raw_phone from 4));
  END IF;
  IF raw_phone LIKE '0%' AND length(raw_phone) = 11 THEN
    phone_variants := phone_variants || ('234' || substring(raw_phone from 2));
    phone_variants := phone_variants || ('+234' || substring(raw_phone from 2));
  END IF;

  SELECT MIN(c.created_at) INTO my_oldest_created
  FROM public.contacts c
  WHERE c.phone = ANY(phone_variants)
    AND c.user_id = _user_id;

  IF my_oldest_created IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.user_id AS owner_user_id, COALESCE(p.name, 'Unknown') AS owner_name
  FROM public.contacts c
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  WHERE c.phone = ANY(phone_variants)
    AND c.user_id != _user_id
    AND c.created_at < my_oldest_created
    AND (
      EXISTS (
        SELECT 1 FROM public.shared_inbox_users
        WHERE (super_user_id = _user_id AND shared_user_id = c.user_id)
        OR (super_user_id = c.user_id AND shared_user_id = _user_id)
        OR (
          EXISTS (
            SELECT 1 FROM public.shared_inbox_users s1
            JOIN public.shared_inbox_users s2 ON s1.super_user_id = s2.super_user_id
            WHERE s1.shared_user_id = _user_id AND s2.shared_user_id = c.user_id
          )
        )
      )
    )
  LIMIT 1;
END;
$function$;