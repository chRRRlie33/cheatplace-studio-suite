-- Ajouter une politique RLS pour permettre aux utilisateurs authentifiés d'insérer des logs
CREATE POLICY "Authenticated users can insert logs"
ON public.logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Permettre aussi aux utilisateurs non authentifiés d'insérer des logs (pour le logout qui peut échouer après déconnexion)
CREATE POLICY "Anyone can insert logs"
ON public.logs
FOR INSERT
TO anon
WITH CHECK (true);