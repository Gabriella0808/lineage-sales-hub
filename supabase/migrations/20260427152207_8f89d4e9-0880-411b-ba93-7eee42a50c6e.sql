
-- Normalization helper
CREATE OR REPLACE FUNCTION public._norm_dealer_name(t text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(t,'')), '[^a-z0-9 ]', ' ', 'g'),
      '\m(llc|inc|incorporated|co|company|corp|ltd|the)\M', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- Pass 1: Update by norm_name + state (most accurate)
WITH matches AS (
  SELECT DISTINCT ON (d.id)
    d.id AS dealer_id,
    s.phone, s.email, s.website, s.notes
  FROM public.dealers d
  JOIN public._dealer_info_staging s
    ON public._norm_dealer_name(d.name) = s.norm_name
   AND upper(coalesce(d.state,'')) = upper(s.state)
   AND s.state <> ''
  ORDER BY d.id, s.name
)
UPDATE public.dealers d
SET
  phone   = COALESCE(NULLIF(m.phone, ''),   d.phone),
  email   = COALESCE(NULLIF(m.email, ''),   d.email),
  website = COALESCE(NULLIF(m.website, ''), d.website),
  notes   = COALESCE(NULLIF(m.notes, ''),   d.notes),
  updated_at = now()
FROM matches m
WHERE d.id = m.dealer_id;

-- Pass 2: Match remaining by norm_name + city (for dealers we didn't already fill)
WITH matches AS (
  SELECT DISTINCT ON (d.id)
    d.id AS dealer_id,
    s.phone, s.email, s.website, s.notes
  FROM public.dealers d
  JOIN public._dealer_info_staging s
    ON public._norm_dealer_name(d.name) = s.norm_name
   AND lower(coalesce(d.city,'')) = lower(s.city)
   AND s.city <> ''
  WHERE d.phone IS NULL AND d.email IS NULL AND d.website IS NULL AND d.notes IS NULL
  ORDER BY d.id, s.name
)
UPDATE public.dealers d
SET
  phone   = COALESCE(NULLIF(m.phone, ''),   d.phone),
  email   = COALESCE(NULLIF(m.email, ''),   d.email),
  website = COALESCE(NULLIF(m.website, ''), d.website),
  notes   = COALESCE(NULLIF(m.notes, ''),   d.notes),
  updated_at = now()
FROM matches m
WHERE d.id = m.dealer_id;

-- Pass 3: Match remaining by unique norm_name only (when no city/state match was possible)
WITH unique_names AS (
  SELECT norm_name,
         MAX(phone) AS phone, MAX(email) AS email,
         MAX(website) AS website, MAX(notes) AS notes,
         COUNT(*) AS cnt
  FROM public._dealer_info_staging
  GROUP BY norm_name
  HAVING COUNT(*) = 1
), matches AS (
  SELECT DISTINCT ON (d.id)
    d.id AS dealer_id,
    u.phone, u.email, u.website, u.notes
  FROM public.dealers d
  JOIN unique_names u
    ON public._norm_dealer_name(d.name) = u.norm_name
  WHERE d.phone IS NULL AND d.email IS NULL AND d.website IS NULL AND d.notes IS NULL
  ORDER BY d.id
)
UPDATE public.dealers d
SET
  phone   = COALESCE(NULLIF(m.phone, ''),   d.phone),
  email   = COALESCE(NULLIF(m.email, ''),   d.email),
  website = COALESCE(NULLIF(m.website, ''), d.website),
  notes   = COALESCE(NULLIF(m.notes, ''),   d.notes),
  updated_at = now()
FROM matches m
WHERE d.id = m.dealer_id;

-- Cleanup
DROP TABLE IF EXISTS public._dealer_info_staging;
DROP FUNCTION IF EXISTS public._norm_dealer_name(text);
