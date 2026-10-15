-- A tiny stand-in for the parts of a real Supabase database our migrations rely on, so the
-- migrations can run on a local Postgres (PGlite) in tests. NOT applied to the real project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key);

-- Supabase reads the signed-in user from the request's JWT; tests set it with set_config.
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase Realtime streams changes of tables in this publication.
create publication supabase_realtime;
