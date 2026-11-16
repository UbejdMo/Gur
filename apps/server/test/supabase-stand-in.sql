-- The few parts of a Supabase project that the migrations lean on, for trying them out on a
-- plain Postgres: the sign-ins, the two roles a request runs as, and who is signed in.
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
-- What Supabase keeps beside a sign-in (sessions and the like) goes when the sign-in goes.
create table auth.sessions (id serial primary key, user_id uuid references auth.users on delete cascade);
create role anon;
create role authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase reads the signed-in user from the request; here a setting plays that part.
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
