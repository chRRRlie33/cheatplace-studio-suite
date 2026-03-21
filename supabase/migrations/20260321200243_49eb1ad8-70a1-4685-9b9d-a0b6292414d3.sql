
-- Allow nullable user_id in key_usage_logs
ALTER TABLE public.key_usage_logs ALTER COLUMN user_id DROP NOT NULL;

-- Allow anon and authenticated to insert into key_usage_logs
CREATE POLICY "Anyone can insert key usage logs"
ON public.key_usage_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Update redeem_offer_key to accept nullable user_id
CREATE OR REPLACE FUNCTION public.redeem_offer_key(_offer_id uuid, _key_value text, _user_id uuid DEFAULT NULL)
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

  INSERT INTO public.key_usage_logs (key_id, offer_id, user_id)
  VALUES (_key_id, _offer_id, _user_id);

  RETURN true;
END;
$function$;
