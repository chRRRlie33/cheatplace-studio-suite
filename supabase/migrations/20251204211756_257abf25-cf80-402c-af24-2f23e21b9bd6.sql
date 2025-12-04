-- Créer le bucket offer-files avec limite de 150MB s'il n'existe pas
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('offer-files', 'offer-files', true, 157286400)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 157286400;

-- Créer le bucket offer-media pour images/vidéos avec limite de 150MB
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('offer-media', 'offer-media', true, 157286400)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 157286400;

-- Supprimer les anciennes policies pour les recréer
DROP POLICY IF EXISTS "Public read access offer-files" ON storage.objects;
DROP POLICY IF EXISTS "Vendors can upload offer-files" ON storage.objects;
DROP POLICY IF EXISTS "Vendors can update own offer-files" ON storage.objects;
DROP POLICY IF EXISTS "Vendors can delete own offer-files" ON storage.objects;
DROP POLICY IF EXISTS "Public read access offer-media" ON storage.objects;
DROP POLICY IF EXISTS "Vendors can upload offer-media" ON storage.objects;
DROP POLICY IF EXISTS "Vendors can update own offer-media" ON storage.objects;
DROP POLICY IF EXISTS "Vendors can delete own offer-media" ON storage.objects;

-- Policies pour offer-files
CREATE POLICY "Public read access offer-files"
ON storage.objects FOR SELECT
USING (bucket_id = 'offer-files');

CREATE POLICY "Vendors can upload offer-files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'offer-files' AND (public.has_role(auth.uid(), 'vendor'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Vendors can update own offer-files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'offer-files' AND (public.has_role(auth.uid(), 'vendor'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Vendors can delete own offer-files"
ON storage.objects FOR DELETE
USING (bucket_id = 'offer-files' AND (public.has_role(auth.uid(), 'vendor'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

-- Policies pour offer-media
CREATE POLICY "Public read access offer-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'offer-media');

CREATE POLICY "Vendors can upload offer-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'offer-media' AND (public.has_role(auth.uid(), 'vendor'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Vendors can update own offer-media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'offer-media' AND (public.has_role(auth.uid(), 'vendor'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "Vendors can delete own offer-media"
ON storage.objects FOR DELETE
USING (bucket_id = 'offer-media' AND (public.has_role(auth.uid(), 'vendor'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

-- Ajouter colonne pour stocker plusieurs médias (JSON array)
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS media_urls jsonb DEFAULT '[]'::jsonb;