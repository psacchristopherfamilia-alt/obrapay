-- Fase B (2): día de inicio de semana y días hasta el pago por compañía.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create or replace function pg_temp.hacer_plataforma(p_perfil uuid) returns void language sql security definer as $f$
  insert into public.plataforma_duenos (perfil_id) values (p_perfil) $f$;
create or replace function pg_temp.semana_de(p_emp uuid, p_fecha date) returns public.semanas language plpgsql security definer as $f$
declare v_id uuid; r public.semanas;
begin
  v_id := public.asegurar_semana(p_emp, p_fecha);
  select * into r from public.semanas where id = v_id;
  return r;
end $f$;
create or replace function pg_temp.cierra(p_semana uuid) returns void language sql security definer as $f$
  select public._cerrar_semana(p_semana) $f$;
grant execute on all functions in schema pg_temp to public;
select pg_temp.hacer_plataforma(pg_temp.yo('c3'));

-- lo existente no cambia: jueves a miércoles, pago el viernes
select test.igual((select pago - fin from pg_temp.semana_de('00000000-0000-0000-0000-0000000000e1', '2026-10-14')), 2, 'por defecto se paga 2 días después del cierre (viernes)');
select test.igual(public.semana_inicio_de('2026-10-14', '00000000-0000-0000-0000-0000000000e1'), '2026-10-08'::date, 'por defecto la semana empieza el jueves');

set role authenticated;
select test.como(pg_temp.yo('c3'));
select public.plataforma_guardar_cliente(null, 'Cliente Lunes', null, null, null, null) as cli \gset
select public.plataforma_guardar_empresa(null, :'cli', 'Compañía Lunes', null, null, 500, null, null) as emp \gset
select test.falla(format($q$select public.plataforma_guardar_config(%L, '{"semana_inicio_dia":9}')$q$, :'emp'), 'inicio', 'día de inicio inválido');
select test.falla(format($q$select public.plataforma_guardar_config(%L, '{"pago_dias_despues":20}')$q$, :'emp'), 'pago', 'días de pago inválidos');
-- lunes a domingo, pago 4 días después (jueves)
select public.plataforma_guardar_config(:'emp', '{"semana_inicio_dia":1,"pago_dias_despues":4}');
reset role;
select test.igual(public.semana_inicio_de('2026-10-14', :'emp'), '2026-10-12'::date, 'la semana empieza el lunes');
select test.igual((select inicio from pg_temp.semana_de(:'emp', '2026-10-14')), '2026-10-12'::date, 'la semana creada empieza el lunes');
select test.igual((select fin from pg_temp.semana_de(:'emp', '2026-10-14')), '2026-10-18'::date, 'y termina el domingo');
select test.igual((select pago from pg_temp.semana_de(:'emp', '2026-10-14')), '2026-10-22'::date, 'se paga el jueves siguiente');

-- cambiar solo el día de pago mueve las semanas abiertas, no las cerradas
set role authenticated;
select test.como(pg_temp.yo('c3'));
select public.plataforma_guardar_config(:'emp', '{"pago_dias_despues":5}');
reset role;
select test.igual((select pago from pg_temp.semana_de(:'emp', '2026-10-14')), '2026-10-23'::date, 'la semana abierta toma el nuevo día de pago');
select pg_temp.cierra((select id from pg_temp.semana_de(:'emp', '2026-10-14')));
set role authenticated;
select test.como(pg_temp.yo('c3'));
select public.plataforma_guardar_config(:'emp', '{"pago_dias_despues":1}');
reset role;
select test.igual((select pago from public.semanas where empresa_id = :'emp' and inicio = '2026-10-12'), '2026-10-23'::date, 'la semana cerrada conserva su fecha de pago');
select test.igual((select pago - fin from public.semanas where empresa_id = :'emp' and inicio = '2026-10-19'), 1, 'la semana siguiente usa el nuevo día de pago');

-- una compañía con horas registradas no cambia el día de inicio
select test.turno('c1', 'f1', '2026-10-01', '09:00', '12:00');
set role authenticated;
select test.como(pg_temp.yo('c3'));
select test.falla($$select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"semana_inicio_dia":1}')$$, 'registre horas', 'no cambia el inicio con semanas cerradas o turnos');
select test.igual(public.plataforma_config(:'emp') ->> 'semana_inicio_dia', '1', 'la configuración devuelve el día de inicio');
rollback;
