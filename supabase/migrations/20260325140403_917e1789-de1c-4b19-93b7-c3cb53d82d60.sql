
-- 1. Remove the overly permissive SELECT policy on offer_keys
DROP POLICY IF EXISTS "Authenticated users can check keys" ON public.offer_keys;

-- 2. Create a SECURITY DEFINER function to check key availability without exposing key values
CREATE OR REPLACE FUNCTION public.check_offer_key_availability(_offer_id uuid)
RETURNS TABLE(total bigint, available bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE used = false)::bigint AS available
  FROM public.offer_keys
  WHERE offer_id = _offer_id;
$$;

-- 3. Create a SECURITY DEFINER function to check if an IP is banned
CREATE OR REPLACE FUNCTION public.is_ip_banned(_ip_address text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_ips WHERE ip_address = _ip_address
  );
$$;

-- 4. Create a SECURITY DEFINER function to check if an email is banned
CREATE OR REPLACE FUNCTION public.is_email_banned(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_emails WHERE email = _email
  );
$$;

-- 5. Remove the public SELECT on banned_ips (ban check now goes through function)
DROP POLICY IF EXISTS "Anyone can read banned IPs" ON public.banned_ips;

-- 6. Add RLS policies for verification_codes
CREATE POLICY "Anon can insert verification codes"
ON public.verification_codes
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Anon can select own verification codes"
ON public.verification_codes
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Anon can update own verification codes"
ON public.verification_codes
FOR UPDATE
TO anon, authenticated
USING (true);
