-- Marcas hechas sin conexión: hora real del teléfono, reintentos sin duplicar y revisión del supervisor.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;

set role authenticated;
select test.como(pg_temp.yo('c1'));

select test.ok(public.marcar_entrada(pg_temp.yo('f1'), null, null, now() - interval '3 hours', '11111111-1111-1111-1111-111111111111') is not null, 'entrada con la hora real de hace 3 horas');
select test.igual((select entrada < now() - interval '2 hours 59 minutes' from public.turnos where perfil_id = pg_temp.yo('c1') and salida is null), true, 'se guarda la hora del teléfono, no la del envío');
select test.igual((select marca_diferida from public.turnos where perfil_id = pg_temp.yo('c1') and salida is null), true, 'enviada con retraso: queda marcada como diferida');
select public.marcar_entrada(pg_temp.yo('f1'), null, null, now() - interval '3 hours', '11111111-1111-1111-1111-111111111111');
select test.igual((select count(*)::int from public.turnos where perfil_id = pg_temp.yo('c1')), 1, 'reintentar con la misma clave no duplica el turno');

select test.ok(public.marcar_salida(null, null, now() - interval '1 hour', '22222222-2222-2222-2222-222222222222') is not null, 'salida con la hora real de hace 1 hora');
select test.igual((select salida < now() - interval '59 minutes' from public.turnos where perfil_id = pg_temp.yo('c1')), true, 'la salida guarda la hora del teléfono');
select test.igual((select estado from public.turnos where perfil_id = pg_temp.yo('c1')), 'por_aprobar', 'un turno diferido espera al supervisor aunque termine antes de las 5 p.m.');
select public.marcar_salida(null, null, now() - interval '1 hour', '22222222-2222-2222-2222-222222222222');
select test.igual((select count(*)::int from public.turnos where perfil_id = pg_temp.yo('c1') and estado = 'por_aprobar'), 1, 'reintentar la salida con la misma clave no falla ni duplica');
select test.falla($$select public.marcar_salida(null, null, now(), '33333333-3333-3333-3333-333333333333')$$, 'No tienes un turno abierto', 'una salida con otra clave sin turno abierto sigue fallando');

select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f1', null, null, now() + interval '10 minutes')$$, 'futuro', 'no acepta marcas del futuro');
select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f1', null, null, now() - interval '100 hours')$$, 'más de 3 días', 'no acepta marcas de hace más de 3 días');
select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f1', null, null, now() - interval '2 hours')$$, 'se cruza', 'no acepta una entrada que se cruza con otro turno');

select test.ok(public.marcar_entrada(pg_temp.yo('f1'), null, null, now() - interval '1 minute') is not null, 'entrada casi inmediata');
select test.igual((select marca_diferida from public.turnos where perfil_id = pg_temp.yo('c1') and salida is null), false, 'con menos de 5 minutos de retraso no es diferida');

rollback;
