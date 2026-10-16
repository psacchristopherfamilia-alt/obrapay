-- Imita lo mínimo de Supabase para correr las migraciones en un Postgres normal.
-- NO se ejecuta en Supabase.
create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique,
  instance_id uuid, aud text, role text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
  encrypted_password text, confirmation_token text, recovery_token text, email_change text, email_change_token_new text
);
create table if not exists auth.identities (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, provider_id text not null,
  identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create extension if not exists pgcrypto schema extensions;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Utilidades de prueba
create schema if not exists test;
grant usage on schema test to authenticated, anon;

create or replace function test.ok(p_cond boolean, p_nombre text) returns void
language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FALLA: %', p_nombre;
  end if;
  raise notice 'ok - %', p_nombre;
end $$;

create or replace function test.igual(p_real anyelement, p_esperado anyelement, p_nombre text) returns void
language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    raise exception 'FALLA: % (esperado %, obtenido %)', p_nombre, p_esperado, p_real;
  end if;
  raise notice 'ok - %', p_nombre;
end $$;

-- Ejecuta SQL y verifica que falle con un mensaje que contenga p_parte.
create or replace function test.falla(p_sql text, p_parte text, p_nombre text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_parte in sqlerrm) > 0 then
      raise notice 'ok - %', p_nombre;
      return;
    end if;
    raise exception 'FALLA: % (error inesperado: %)', p_nombre, sqlerrm;
  end;
  raise exception 'FALLA: % (no dio error)', p_nombre;
end $$;

grant execute on all functions in schema test to authenticated, anon;

-- Actuar como un usuario: select test.como('<uuid>');  /  select test.como(null) para volver.
create or replace function test.como(p_usuario uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_usuario::text, ''), false);
end $$;
grant execute on function test.como(uuid) to authenticated, anon;
