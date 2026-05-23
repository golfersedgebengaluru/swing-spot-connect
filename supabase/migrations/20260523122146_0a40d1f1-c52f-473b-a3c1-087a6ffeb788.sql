CREATE OR REPLACE FUNCTION public.age_years(_dob date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN _dob IS NULL THEN NULL
              ELSE EXTRACT(YEAR FROM age(_dob))::int END
$$;