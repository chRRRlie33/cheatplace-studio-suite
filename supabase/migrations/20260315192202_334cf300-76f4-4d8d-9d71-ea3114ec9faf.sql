
-- Create key usage history table
CREATE TABLE public.key_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid NOT NULL REFERENCES public.offer_keys(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  used_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.key_usage_logs ENABLE ROW LEVEL SECURITY;

-- Admins and vendors can view usage logs
CREATE POLICY "Admins and vendors can view key usage logs"
ON public.key_usage_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vendor'::app_role));

-- Update redeem function to also log usage
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

  -- Log the usage
  INSERT INTO public.key_usage_logs (key_id, offer_id, user_id)
  VALUES (_key_id, _offer_id, _user_id);

  RETURN true;
END;
$function$;
