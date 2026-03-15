
-- Add max_uses and use_count columns to offer_keys
ALTER TABLE public.offer_keys ADD COLUMN IF NOT EXISTS max_uses integer NOT NULL DEFAULT 1;
ALTER TABLE public.offer_keys ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;

-- Update used column to be computed from use_count >= max_uses
-- We'll keep "used" as a derived check in the function instead

-- Update the redeem function to support multi-use keys
CREATE OR REPLACE FUNCTION public.redeem_offer_key(_offer_id uuid, _key_value text, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _key_id uuid;
BEGIN
  SELECT id INTO _key_id
  FROM public.offer_keys
  WHERE offer_id = _offer_id
    AND key_value = _key_value
    AND use_count < max_uses
  LIMIT 1
  FOR UPDATE;

  IF _key_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.offer_keys
  SET use_count = use_count + 1,
      used = (use_count + 1 >= max_uses),
      used_by = _user_id,
      used_at = now()
  WHERE id = _key_id;

  RETURN true;
END;
$function$;
