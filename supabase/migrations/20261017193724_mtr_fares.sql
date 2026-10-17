-- Multimodal step 2 (DECISIONS.md D32): MTR adult Octopus fares for our fallback transit planner.
-- plan-trip fills this table itself from MTR's open data CSV the first time it needs a fare
-- (https://opendata.mtr.com.hk/data/mtr_lines_fares.csv, © MTR Corporation via DATA.GOV.HK),
-- then looks up only the two stations of each option. Why a table and not code: 9,000 fares would
-- make the function bundle ten times bigger.
-- Server only (RLS on, no grants), like conditions_cache.
create table public.mtr_fares (
  src_id integer not null,
  dest_id integer not null,
  octopus_adult numeric(6, 2) not null check (octopus_adult >= 0),
  primary key (src_id, dest_id)
);

alter table public.mtr_fares enable row level security;
revoke all on table public.mtr_fares from anon, authenticated;
