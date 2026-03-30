
-- 1. Create gst_profiles table (per-city GST configuration)
CREATE TABLE public.gst_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL UNIQUE,
  legal_name text NOT NULL DEFAULT '',
  gstin text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  state_code text NOT NULL DEFAULT '',
  invoice_prefix text NOT NULL DEFAULT 'INV',
  invoice_start_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gst_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage gst_profiles" ON public.gst_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Site admins will need read access (we'll add site_admin policy after enum update)

-- 2. Replace 'moderator' with 'site_admin' in app_role enum
ALTER TYPE public.app_role RENAME VALUE 'moderator' TO 'site_admin';

-- 3. Create site_admin_cities table (many-to-many: user_id + city)
CREATE TABLE public.site_admin_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, city)
);

ALTER TABLE public.site_admin_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage site_admin_cities" ON public.site_admin_cities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Site admins can read their own city assignments
CREATE POLICY "Site admins can view own cities" ON public.site_admin_cities
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 4. Create helper function: check if user is admin or site_admin
CREATE OR REPLACE FUNCTION public.is_admin_or_site_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'site_admin')
  )
$$;

-- 5. Create helper function: check if site_admin has access to a city
CREATE OR REPLACE FUNCTION public.has_city_access(_user_id uuid, _city text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.site_admin_cities
    WHERE user_id = _user_id AND city = _city
  )
$$;

-- 6. Allow site_admins to read gst_profiles for their assigned cities
CREATE POLICY "Site admins can view own city gst_profiles" ON public.gst_profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin') AND
    public.has_city_access(auth.uid(), city)
  );

-- Allow site_admins to update gst_profiles for their assigned cities
CREATE POLICY "Site admins can update own city gst_profiles" ON public.gst_profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin') AND
    public.has_city_access(auth.uid(), city)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin') AND
    public.has_city_access(auth.uid(), city)
  );
