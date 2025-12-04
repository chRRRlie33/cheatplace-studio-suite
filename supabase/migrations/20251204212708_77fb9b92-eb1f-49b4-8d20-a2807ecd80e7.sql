-- Fix security definer view issue - drop and recreate with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_profiles;

-- Create view with security invoker (uses querying user's permissions)
CREATE VIEW public.public_profiles 
WITH (security_invoker = true)
AS
SELECT id, username, role, created_at
FROM profiles;

-- Grant access to the view
GRANT SELECT ON public.public_profiles TO anon, authenticated;