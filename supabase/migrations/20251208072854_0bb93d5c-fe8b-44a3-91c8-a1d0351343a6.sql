-- Ajouter une colonne pour l'IP d'inscription
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ip_signup character varying;

-- Ajouter un commentaire pour clarifier
COMMENT ON COLUMN public.profiles.ip_signup IS 'IP address used during signup';
COMMENT ON COLUMN public.profiles.ip_last_login IS 'IP address from last login';