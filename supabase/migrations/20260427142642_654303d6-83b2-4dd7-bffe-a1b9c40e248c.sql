CREATE OR REPLACE FUNCTION public.tag_dealers_by_name_coord(_owner text, _items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH src AS (
    SELECT
      lower(elem->>'n') AS name_l,
      round((elem->>'la')::numeric, 4) AS lat4,
      round((elem->>'ln')::numeric, 4) AS lng4
    FROM jsonb_array_elements(_items) AS elem
  ),
  upd AS (
    UPDATE public.dealers d
       SET rep_owner = _owner
      FROM src s
     WHERE lower(d.name) = s.name_l
       AND round(d.lat::numeric, 4) = s.lat4
       AND round(d.lng::numeric, 4) = s.lng4
       AND (d.rep_owner IS NULL OR d.rep_owner <> _owner)
    RETURNING 1
  )
  SELECT count(*) INTO updated_count FROM upd;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.tag_dealers_by_name_coord(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tag_dealers_by_name_coord(text, jsonb) FROM anon, authenticated;