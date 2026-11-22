-- SAMPLE pin for the team to try the review flow (docs/PINS.md, D53). NOT applied automatically.
--
-- Run it once in the Supabase dashboard → SQL editor, AFTER an expert exists, with that expert's
-- account id in place of the placeholder below. It creates the pin "in review" and marked as
-- sample content; it never goes live by itself — a reviewer approves it.
--
-- No facts are invented here: the summary is left for the expert to write from the two sources
-- (their titles and links were checked on 23 Nov 2026). Reading versions are generated from the
-- summary afterwards on the pin's page (/admin).
do $$
declare
  v_expert uuid := '00000000-0000-0000-0000-000000000000'; -- ← the expert's account id
  v_pin uuid;
begin
  if not exists (select 1 from public.experts where user_id = v_expert) then
    raise exception 'Put an existing expert''s account id in v_expert first';
  end if;

  insert into public.pins (
    title, location, place_kind, place_description, radius_m, topics, status, author_expert_id, is_sample
  )
  values (
    'Why Kent Road is in Kowloon',
    -- APPROXIMATE point in Kowloon Tong. Check it on site and correct it before approving:
    -- update public.pins set location = extensions.st_setsrid(extensions.st_makepoint(<lng>, <lat>), 4326) where id = '<pin id>';
    extensions.st_setsrid(extensions.st_makepoint(114.1786, 22.3353), 4326),
    'custom',
    'Kent Road, Kowloon Tong — sample pin, approximate spot to be checked on site',
    40,
    array['history', 'street names'],
    'in_review',
    v_expert,
    true
  )
  returning id into v_pin;

  insert into public.pin_sources (pin_id, title, url, doi, source_db, is_open_access) values
    (v_pin,
     'Kowloon Tong history: Hong Kong''s original garden city and its unusual path (South China Morning Post, 5 November 2018)',
     'https://www.scmp.com/lifestyle/travel-leisure/article/2171675/kowloon-tong-history-hong-kongs-original-garden-city-and',
     null, 'web', false),
    (v_pin,
     'Kowloon Tong Garden Estate [c.1922- ] (Gwulo: Old Hong Kong)',
     'https://gwulo.com/node/38894',
     null, 'web', true);

  raise notice 'Sample pin created: %', v_pin;
end $$;
