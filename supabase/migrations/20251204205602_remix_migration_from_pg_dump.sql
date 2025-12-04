CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'client',
    'vendor',
    'admin'
);


--
-- Name: get_user_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role(_user_id uuid) RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role 
  FROM public.user_roles 
  WHERE user_id = _user_id 
  ORDER BY 
    CASE role
      WHEN 'admin' THEN 1
      WHEN 'vendor' THEN 2
      WHEN 'client' THEN 3
    END
  LIMIT 1
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _role app_role;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'client');
  
  -- Insert into profiles
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
    _role
  );
  
  -- Insert into user_roles (the secure way)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Log user registration
  INSERT INTO public.logs (user_id, action_type, message, metadata)
  VALUES (
    NEW.id,
    'user_registered',
    'Nouvel utilisateur enregistré',
    jsonb_build_object('username', COALESCE(NEW.raw_user_meta_data->>'username', NEW.email))
  );
  
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: increment_login_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_login_count(user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.profiles
  SET login_count = login_count + 1
  WHERE id = user_id;
END;
$$;


--
-- Name: increment_offer_download(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_offer_download(_offer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.offers
  SET download_count = download_count + 1
  WHERE id = _offer_id;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: banned_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banned_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    banned_at timestamp with time zone DEFAULT now() NOT NULL,
    banned_by uuid,
    reason text
);


--
-- Name: banned_ips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banned_ips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address text NOT NULL,
    banned_by uuid,
    banned_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text
);


--
-- Name: logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action_type text NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    file_url text,
    file_size bigint,
    file_format text,
    image_preview_url text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    download_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    media_url text,
    media_type text DEFAULT 'image'::text
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    role public.app_role DEFAULT 'client'::public.app_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_login timestamp with time zone,
    ip_last_login character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    login_count integer DEFAULT 0 NOT NULL
);


--
-- Name: user_downloads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_downloads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    downloaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: verification_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text NOT NULL,
    code text NOT NULL,
    type text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT verification_codes_type_check CHECK ((type = ANY (ARRAY['login'::text, 'signup'::text])))
);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: banned_emails banned_emails_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_emails
    ADD CONSTRAINT banned_emails_email_key UNIQUE (email);


--
-- Name: banned_emails banned_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_emails
    ADD CONSTRAINT banned_emails_pkey PRIMARY KEY (id);


--
-- Name: banned_ips banned_ips_ip_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_ips
    ADD CONSTRAINT banned_ips_ip_address_key UNIQUE (ip_address);


--
-- Name: banned_ips banned_ips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_ips
    ADD CONSTRAINT banned_ips_pkey PRIMARY KEY (id);


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY (id);


--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: user_downloads user_downloads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_downloads
    ADD CONSTRAINT user_downloads_pkey PRIMARY KEY (id);


--
-- Name: user_downloads user_downloads_user_id_offer_id_downloaded_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_downloads
    ADD CONSTRAINT user_downloads_user_id_offer_id_downloaded_at_key UNIQUE (user_id, offer_id, downloaded_at);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: verification_codes verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_codes
    ADD CONSTRAINT verification_codes_pkey PRIMARY KEY (id);


--
-- Name: idx_announcements_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_author_id ON public.announcements USING btree (author_id);


--
-- Name: idx_announcements_pinned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_pinned ON public.announcements USING btree (pinned, created_at DESC);


--
-- Name: idx_announcements_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_visible ON public.announcements USING btree (visible);


--
-- Name: idx_banned_emails_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banned_emails_email ON public.banned_emails USING btree (email);


--
-- Name: idx_logs_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_action_type ON public.logs USING btree (action_type);


--
-- Name: idx_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_created_at ON public.logs USING btree (created_at DESC);


--
-- Name: idx_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_user_id ON public.logs USING btree (user_id);


--
-- Name: idx_offers_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offers_created_at ON public.offers USING btree (created_at DESC);


--
-- Name: idx_offers_vendor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offers_vendor_id ON public.offers USING btree (vendor_id);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_profiles_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_username ON public.profiles USING btree (username);


--
-- Name: idx_user_downloads_offer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_downloads_offer_id ON public.user_downloads USING btree (offer_id);


--
-- Name: idx_user_downloads_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_downloads_user_id ON public.user_downloads USING btree (user_id);


--
-- Name: idx_user_roles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role ON public.user_roles USING btree (role);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_verification_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_codes_code ON public.verification_codes USING btree (code);


--
-- Name: idx_verification_codes_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_codes_email ON public.verification_codes USING btree (email);


--
-- Name: announcements update_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: offers update_offers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_offers_updated_at BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: announcements announcements_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: banned_emails banned_emails_banned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_emails
    ADD CONSTRAINT banned_emails_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES auth.users(id);


--
-- Name: banned_ips banned_ips_banned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_ips
    ADD CONSTRAINT banned_ips_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES public.profiles(id);


--
-- Name: logs logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: offers offers_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_downloads user_downloads_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_downloads
    ADD CONSTRAINT user_downloads_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;


--
-- Name: user_downloads user_downloads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_downloads
    ADD CONSTRAINT user_downloads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: verification_codes verification_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_codes
    ADD CONSTRAINT verification_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: offers Admins and owners can delete offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and owners can delete offers" ON public.offers FOR DELETE TO authenticated USING (((auth.uid() = vendor_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: banned_ips Admins can manage banned IPs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage banned IPs" ON public.banned_ips USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: banned_emails Admins can manage banned emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage banned emails" ON public.banned_emails USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can update all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: verification_codes Anyone can insert verification codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert verification codes" ON public.verification_codes FOR INSERT WITH CHECK (true);


--
-- Name: banned_ips Anyone can read banned IPs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read banned IPs" ON public.banned_ips FOR SELECT USING (true);


--
-- Name: verification_codes Anyone can update verification codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update verification codes" ON public.verification_codes FOR UPDATE USING (true);


--
-- Name: announcements Authors and admins can delete announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors and admins can delete announcements" ON public.announcements FOR DELETE TO authenticated USING (((auth.uid() = author_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: announcements Authors and admins can update announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors and admins can update announcements" ON public.announcements FOR UPDATE TO authenticated USING (((auth.uid() = author_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: offers Offers are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Offers are viewable by everyone" ON public.offers FOR SELECT USING (true);


--
-- Name: user_roles Only admins can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can manage roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Public profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);


--
-- Name: user_downloads Users can insert their own downloads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own downloads" ON public.user_downloads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: verification_codes Users can view their own codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own codes" ON public.verification_codes FOR SELECT USING (((email = ((current_setting('request.jwt.claims'::text, true))::json ->> 'email'::text)) OR (user_id = auth.uid())));


--
-- Name: user_downloads Users can view their own downloads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own downloads" ON public.user_downloads FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: logs Vendors and admins can view logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vendors and admins can view logs" ON public.logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'vendor'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: announcements Vendors can create announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vendors can create announcements" ON public.announcements FOR INSERT TO authenticated WITH CHECK (((auth.uid() = author_id) AND (public.has_role(auth.uid(), 'vendor'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: offers Vendors can create offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vendors can create offers" ON public.offers FOR INSERT TO authenticated WITH CHECK (((auth.uid() = vendor_id) AND (public.has_role(auth.uid(), 'vendor'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: offers Vendors can update own offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vendors can update own offers" ON public.offers FOR UPDATE TO authenticated USING (((auth.uid() = vendor_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: announcements Visible announcements are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Visible announcements are viewable by everyone" ON public.announcements FOR SELECT USING ((visible = true));


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: banned_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banned_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: banned_ips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banned_ips ENABLE ROW LEVEL SECURITY;

--
-- Name: logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

--
-- Name: offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_downloads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_downloads ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: verification_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


