-- Fase D: aceptación de términos y usuario de la demostración.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create or replace function pg_temp.hacer_plataforma(p_perfil uuid) returns void language sql security definer as $f$
  insert into public.plataforma_duenos (perfil_id) values (p_perfil) $f$;
create or replace function pg_temp.login_demo() returns text language sql security definer as $f$
  select u.email || '|' || (u.encrypted_password = extensions.crypt('ObraPayDemo2026', u.encrypted_password))::text
    || '|' || (select count(*) from auth.identities i where i.user_id = u.id)::text
    || '|' || (select string_agg(r, ',') from public.perfiles p, unnest(p.roles) r where p.id = u.id)
  from auth.users u join public.perfiles p on p.id = u.id where p.usuario = 'demo.obrapay' $f$;
create or replace function pg_temp.identidades_huerfanas() returns int language sql security definer as $f$
  select count(*)::int from auth.identities where user_id not in (select id from auth.users) $f$;
create or replace function pg_temp.reinicio_auto() returns void language sql security definer as $f$
  select public._demo_reiniciar_auto() $f$;
create or replace function pg_temp.demo_id() returns uuid language sql security definer as $f$
  select id from public.empresas where demo limit 1 $f$;
create or replace function pg_temp.demo_cuenta_perfiles() returns int language sql security definer as $f$
  select count(*)::int from public.perfiles where empresa_id = (select id from public.empresas where demo limit 1) $f$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.hacer_plataforma(pg_temp.yo('c3'));
set role authenticated;

-- Términos
select test.como(pg_temp.yo('c1'));
select test.igual(public.mi_aceptacion() is null, true, 'al inicio nadie ha aceptado');
select public.aceptar_terminos('2026-10-1');
select test.igual(public.mi_aceptacion(), '2026-10-1', 'queda registrada la versión aceptada');
select pg_sleep(0.01);
select public.aceptar_terminos('2026-11-1');
select test.igual(public.mi_aceptacion(), '2026-11-1', 'si cambia la versión, vale la última');
select test.falla($$select public.aceptar_terminos('')$$, 'Versión', 'no acepta versión vacía');
select test.como(pg_temp.yo('c2'));
select test.igual(public.mi_aceptacion() is null, true, 'cada persona acepta por su cuenta');
select test.falla($$select * from public.aceptaciones$$, 'permission', 'nadie lee la tabla directamente');

-- Demo con usuario de entrada
select test.como(pg_temp.yo('c3'));
select public.plataforma_crear_demo() as demo \gset
reset role;
select test.igual(pg_temp.login_demo(), 'demo.obrapay@obrapay.local|true|1|admin', 'la demo trae un administrador con clave y entrada válida');
select pg_temp.reinicio_auto();
select test.igual(pg_temp.login_demo(), 'demo.obrapay@obrapay.local|true|1|admin', 'tras el reinicio automático sigue pudiendo entrar');
select test.igual(pg_temp.identidades_huerfanas(), 0, 'no quedan identidades huérfanas');
select test.igual(pg_temp.demo_cuenta_perfiles(), 12, 'y la demo sigue con 12 personas');
rollback;
