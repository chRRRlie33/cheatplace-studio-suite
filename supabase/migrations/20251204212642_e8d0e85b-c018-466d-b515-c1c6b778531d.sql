-- Fix profiles table exposure: restrict access to sensitive columns
-- Only users can see their own full profile, admins can see all

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

-- Users can see their own full profile
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create a public view for non-sensitive profile data (username only)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, username, role, created_at
FROM profiles;

-- Grant access to the view
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Fix verification_codes table: remove permissive policies
-- Edge functions use service role key which bypasses RLS

DROP POLICY IF EXISTS "Anyone can insert verification codes" ON verification_codes;
DROP POLICY IF EXISTS "Anyone can update verification codes" ON verification_codes;
DROP POLICY IF EXISTS "Users can view their own codes" ON verification_codes;

-- No public access to verification_codes - only via edge functions with service role