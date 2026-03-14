-- Table pour stocker les keys par offre
CREATE TABLE public.offer_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  key_value text NOT NULL,
  used boolean NOT NULL DEFAULT false,
  used_by uuid,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index pour recherche rapide
CREATE INDEX idx_offer_keys_offer_id ON public.offer_keys(offer_id);
CREATE INDEX idx_offer_keys_key_value ON public.offer_keys(key_value);

-- RLS
ALTER TABLE public.offer_keys ENABLE ROW LEVEL SECURITY;

-- Admins et vendors peuvent tout gérer
CREATE POLICY "Admins and vendors can manage keys"
ON public.offer_keys
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'vendor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'vendor'::app_role)
);

-- Tous les utilisateurs authentifiés peuvent vérifier les keys (SELECT limité)
CREATE POLICY "Authenticated users can check keys"
ON public.offer_keys
FOR SELECT
TO authenticated
USING (true);

-- Fonction pour valider et consommer une key
CREATE OR REPLACE FUNCTION public.redeem_offer_key(_offer_id uuid, _key_value text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _key_id uuid;
BEGIN
  SELECT id INTO _key_id
  FROM public.offer_keys
  WHERE offer_id = _offer_id
    AND key_value = _key_value
    AND used = false
  LIMIT 1
  FOR UPDATE;

  IF _key_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.offer_keys
  SET used = true, used_by = _user_id, used_at = now()
  WHERE id = _key_id;

  RETURN true;
END;
$$;