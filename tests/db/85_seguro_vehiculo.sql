-- Costo del seguro por vehículo: guardar, quitar, validaciones y permisos.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
select public._hoy_empresa('00000000-0000-0000-0000-0000000000e1') as hoy \gset

set role authenticated;
select test.como(pg_temp.yo('a1'));
select public.guardar_vehiculo(null, 'Toyota Hilux 01', 'TCI 4821', 'camioneta', null, null, null, null, pg_temp.yo('c1'), 48000) as v1 \gset

select public.guardar_seguro_vehiculo(:'v1', 1800, 'anual', :'hoy'::date);
select test.igual((select monto from public.vehiculo_seguro_costo where vehiculo_id = :'v1'), 1800::numeric, 'guarda el monto');
select test.igual((select frecuencia from public.vehiculo_seguro_costo where vehiculo_id = :'v1'), 'anual', 'guarda la frecuencia');
select public.guardar_seguro_vehiculo(:'v1', 450, 'trimestral', :'hoy'::date);
select test.igual((select count(*)::int from public.vehiculo_seguro_costo where vehiculo_id = :'v1'), 1, 'cambiarlo no duplica');
select test.igual((select frecuencia from public.vehiculo_seguro_costo where vehiculo_id = :'v1'), 'trimestral', 'cambiarlo actualiza');

select test.falla(format($$select public.guardar_seguro_vehiculo(%L, 100, 'semanal', %L::date)$$, :'v1', :'hoy'), 'cuánto', 'frecuencia inválida');
select test.falla(format($$select public.guardar_seguro_vehiculo(%L, 100, 'anual', null)$$, :'v1'), 'fecha', 'falta la fecha');
select test.falla(format($$select public.guardar_seguro_vehiculo(%L, -5, 'anual', %L::date)$$, :'v1', :'hoy'), 'inválido', 'monto negativo');

-- permisos
select test.como(pg_temp.yo('c1'));
select test.falla(format($$select public.guardar_seguro_vehiculo(%L, 100, 'anual', %L::date)$$, :'v1', :'hoy'), 'permiso', 'el conductor no cambia el seguro');
select test.igual((select count(*)::int from public.vehiculo_seguro_costo), 0, 'el conductor no ve el costo');
select test.como(pg_temp.yo('a1'));
select test.igual((select count(*)::int from public.vehiculo_seguro_costo), 1, 'el admin lo ve');

-- quitar
select public.guardar_seguro_vehiculo(:'v1', 0, null, null);
select test.igual((select count(*)::int from public.vehiculo_seguro_costo where vehiculo_id = :'v1'), 0, 'monto cero lo quita');
rollback;
