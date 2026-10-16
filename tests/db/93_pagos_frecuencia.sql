-- Fase E: pagos quincenales y mensuales.
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

-- lo existente sigue semanal
select test.igual((select pago_frecuencia from public.empresas where id = '00000000-0000-0000-0000-0000000000e1'), 'semanal', 'por defecto se paga cada semana');
select test.igual((select fin - inicio from pg_temp.semana_de('00000000-0000-0000-0000-0000000000e1', '2026-10-14')), 6, 'la semana sigue durando 7 días');

set role authenticated;
select test.como(pg_temp.yo('c3'));
select public.plataforma_guardar_cliente(null, 'Cliente Quincena', null, null, null, null) as cli \gset
select public.plataforma_guardar_empresa(null, :'cli', 'Compañía Quincena', null, null, 500, null, null) as emp \gset
select test.falla(format($q$select public.plataforma_guardar_config(%L, '{"pago_frecuencia":"diario"}')$q$, :'emp'), 'frecuencia', 'frecuencia inválida');
select public.plataforma_guardar_config(:'emp', '{"pago_frecuencia":"quincenal"}');
reset role;

select test.igual((select inicio from pg_temp.semana_de(:'emp', '2026-11-05')), '2026-11-01'::date, 'quincena 1: empieza el día 1');
select test.igual((select fin from pg_temp.semana_de(:'emp', '2026-11-05')), '2026-11-15'::date, 'quincena 1: termina el 15');
select test.igual((select pago from pg_temp.semana_de(:'emp', '2026-11-05')), '2026-11-17'::date, 'se paga 2 días después del cierre');
select test.igual((select inicio from pg_temp.semana_de(:'emp', '2026-11-20')), '2026-11-16'::date, 'quincena 2: empieza el 16');
select test.igual((select fin from pg_temp.semana_de(:'emp', '2026-11-20')), '2026-11-30'::date, 'quincena 2: termina el último día');
select test.igual((select fin from pg_temp.semana_de(:'emp', '2027-02-20')), '2027-02-28'::date, 'febrero termina el 28');
select test.igual(public.semana_inicio_de('2026-11-20', :'emp'), '2026-11-16'::date, 'semana_inicio_de devuelve el inicio de la quincena');
select test.igual(public._nro_periodo('2026-11-01', '2026-11-15', '2026-11-17'), 1, 'número de periodo: primera quincena');
select test.igual(public._nro_periodo('2026-11-16', '2026-11-30', '2026-12-02'), 2, 'número de periodo: segunda quincena');

-- mensual
set role authenticated;
select test.como(pg_temp.yo('c3'));
select public.plataforma_guardar_config(:'emp', '{"pago_frecuencia":"mensual"}');
reset role;
select test.igual((select inicio from pg_temp.semana_de(:'emp', '2026-12-10')), '2026-12-01'::date, 'mensual: empieza el día 1');
select test.igual((select fin from pg_temp.semana_de(:'emp', '2026-12-10')), '2026-12-31'::date, 'mensual: termina el último día');
select test.igual(public._nro_periodo('2026-12-01', '2026-12-31', '2027-01-02'), 1, 'número de periodo mensual');

-- cambio a mitad: el periodo abierto no se parte y el siguiente usa la nueva frecuencia
set role authenticated;
select test.como(pg_temp.yo('c3'));
select public.plataforma_guardar_empresa(null, :'cli', 'Compañía Cambio', null, null, 500, null, null) as emp2 \gset
reset role;
select test.igual((select inicio from pg_temp.semana_de(:'emp2', '2026-10-12')), '2026-10-08'::date, 'empieza semanal (jueves)');
set role authenticated;
select test.como(pg_temp.yo('c3'));
select public.plataforma_guardar_config(:'emp2', '{"pago_frecuencia":"quincenal"}');
reset role;
select test.igual((select inicio from pg_temp.semana_de(:'emp2', '2026-10-12')), '2026-10-08'::date, 'el periodo abierto no cambia');
select test.igual((select fin from pg_temp.semana_de(:'emp2', '2026-10-12')), '2026-10-14'::date, 'el periodo abierto termina como estaba');
select pg_temp.cierra((select id from pg_temp.semana_de(:'emp2', '2026-10-12')));
select test.igual((select inicio from public.semanas where empresa_id = :'emp2' and inicio = '2026-10-15'), '2026-10-15'::date, 'al cerrar, el siguiente periodo empieza el día después');
select test.igual((select fin from public.semanas where empresa_id = :'emp2' and inicio = '2026-10-15'), '2026-10-15'::date, 'el de transición termina el 15 (fin de la quincena)');
select test.igual((select inicio from pg_temp.semana_de(:'emp2', '2026-10-20')), '2026-10-16'::date, 'después ya es quincena completa');
select test.igual((select count(*)::int from public.semanas a join public.semanas b on a.empresa_id = b.empresa_id and a.id < b.id and a.inicio <= b.fin and b.inicio <= a.fin where a.empresa_id = :'emp2'), 0, 'ningún periodo se solapa');
select test.igual((select estado from public.semanas where empresa_id = :'emp2' and inicio = '2026-10-08'), 'cerrada', 'la semana cerrada sigue cerrada');

-- el administrador de la compañía también puede cambiarla; otros roles no
set role authenticated;
select test.como(pg_temp.yo('c1'));
select test.falla($$select public.cambiar_frecuencia_pago('quincenal')$$, 'permiso', 'un trabajador no cambia la frecuencia');
select test.como(pg_temp.yo('a1'));
select test.falla($$select public.cambiar_frecuencia_pago('cada rato')$$, 'frecuencia', 'el admin no puede poner una frecuencia inválida');
select public.cambiar_frecuencia_pago('quincenal');
reset role;
select test.igual((select pago_frecuencia from public.empresas where id = '00000000-0000-0000-0000-0000000000e1'), 'quincenal', 'el admin cambió la frecuencia');
select test.igual((select count(*)::int from public.eventos_admin where empresa_id = '00000000-0000-0000-0000-0000000000e1' and tipo = 'config_cambiada' and detalle::text like '%pago_frecuencia%'), 1, 'el cambio queda en el historial');
rollback;
