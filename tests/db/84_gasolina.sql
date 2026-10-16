-- Gasolina: registro con recibo obligatorio, millas opcionales, correcciones y permisos.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
select public._hoy_empresa('00000000-0000-0000-0000-0000000000e1') as hoy \gset

set role authenticated;
select test.como(pg_temp.yo('a1'));
select public.guardar_vehiculo(null, 'Toyota Hilux 01', 'TCI 4821', 'camioneta', null, null, null, null, pg_temp.yo('c1'), 48000) as v1 \gset
select public.guardar_vehiculo(null, 'Ford Transit', 'TCI 3310', 'van', null, null, null, null, null, 1000) as v2 \gset
select public.guardar_plan(null, :'v1', 'Llantas', 5000, null, :'hoy'::date, 44000) as p1 \gset
select test.igual((select count(*)::int from public.notificaciones where tipo = 'mantenimiento_vehiculo'), 0, 'sin aviso al empezar');

-- el conductor registra
select test.como(pg_temp.yo('c1'));
select public.registrar_gasolina(:'v1', 62.40, '00000000-0000-0000-0000-0000000000e1/gasolina/r1.jpg', 'recibo.jpg', 48600) as g1 \gset
select test.igual((select total from public.vehiculo_gasolina where id = :'g1'), 62.40::numeric, 'guarda el total');
select test.igual((select fecha from public.vehiculo_gasolina where id = :'g1'), :'hoy'::date, 'la fecha por defecto es hoy de la compañía');
select test.igual((select perfil_id from public.vehiculo_gasolina where id = :'g1'), pg_temp.yo('c1'), 'guarda quién la registró');
select test.igual((select millas from public.vehiculos where id = :'v1'), 48600, 'las millas del odómetro suben las del vehículo');

select test.como(pg_temp.yo('a1'));
select test.igual((select count(*)::int from public.notificaciones where tipo = 'mantenimiento_vehiculo'), 1, 'las millas de la carga disparan el aviso de las llantas (400 mi)');
select test.como(pg_temp.yo('c1'));

-- reglas
select test.falla(format($$select public.registrar_gasolina(%L, 50, null, null)$$, :'v1'), 'obligatorio', 'sin recibo no se registra');
select test.falla(format($$select public.registrar_gasolina(%L, 50, '  ', null)$$, :'v1'), 'obligatorio', 'un recibo vacío tampoco');
select test.falla(format($$select public.registrar_gasolina(%L, 50, '00000000-0000-0000-0000-0000000000e2/gasolina/x.jpg', null)$$, :'v1'), 'Archivo inválido', 'no acepta recibos de otra compañía');
select test.falla(format($$select public.registrar_gasolina(%L, 50, '00000000-0000-0000-0000-0000000000e1/x.jpg', null)$$, :'v1'), 'Archivo inválido', 'el recibo debe ir en la carpeta de gasolina');
select test.falla(format($$select public.registrar_gasolina(%L, 0, '00000000-0000-0000-0000-0000000000e1/gasolina/x.jpg', null)$$, :'v1'), 'total', 'el total debe ser mayor que cero');
select test.falla(format($$select public.registrar_gasolina(%L, 50, '00000000-0000-0000-0000-0000000000e1/gasolina/x.jpg', null, null, %L::date + 2)$$, :'v1', :'hoy'), 'futura', 'la fecha no puede ser futura');
select test.falla(format($$select public.registrar_gasolina(%L, 50, '00000000-0000-0000-0000-0000000000e1/gasolina/x.jpg', null, 47000)$$, :'v1'), 'menores', 'el conductor no baja las millas');
select test.falla(format($$select public.registrar_gasolina(%L, 50, '00000000-0000-0000-0000-0000000000e1/gasolina/x.jpg', null)$$, :'v2'), 'permiso', 'quien no maneja el vehículo no registra');

-- sin millas: no toca el odómetro del vehículo
select public.registrar_gasolina(:'v1', 58.90, '00000000-0000-0000-0000-0000000000e1/gasolina/r2.jpg', 'r2.jpg') as g2 \gset
select test.igual((select millas from public.vehiculos where id = :'v1'), 48600, 'sin millas, el vehículo no cambia');
select test.igual((select millas from public.vehiculo_gasolina where id = :'g2'), null::int, 'la carga queda sin millas');

-- quién ve qué
select test.igual((select count(*)::int from public.vehiculo_gasolina), 2, 'el conductor ve sus cargas');
select test.como(pg_temp.yo('c2'));
select test.igual((select count(*)::int from public.vehiculo_gasolina), 0, 'otro trabajador no ve cargas ajenas');
select test.como(pg_temp.yo('d1'));
select test.igual((select count(*)::int from public.vehiculo_gasolina), 2, 'el dueño ve todas');
select test.falla(format($$select public.registrar_gasolina(%L, 50, '00000000-0000-0000-0000-0000000000e1/gasolina/x.jpg', null)$$, :'v1'), 'permiso', 'el dueño no registra');

-- correcciones
select test.como(pg_temp.yo('c1'));
select public.corregir_gasolina(:'g2', 85.00, :'hoy'::date, 48700);
select test.igual((select total from public.vehiculo_gasolina where id = :'g2'), 85.00::numeric, 'el conductor corrige el total');
select test.igual((select millas from public.vehiculos where id = :'v1'), 48700, 'corregir con más millas sube las del vehículo');
select test.igual((select recibo_path from public.vehiculo_gasolina where id = :'g2'), '00000000-0000-0000-0000-0000000000e1/gasolina/r2.jpg', 'sin recibo nuevo conserva el anterior');
select public.corregir_gasolina(:'g2', 85.00, :'hoy'::date, 48700, '00000000-0000-0000-0000-0000000000e1/gasolina/r3.jpg', 'r3.jpg');
select test.igual((select recibo_path from public.vehiculo_gasolina where id = :'g2'), '00000000-0000-0000-0000-0000000000e1/gasolina/r3.jpg', 'puede reemplazar el recibo');
select test.igual((select (editado_en is not null) from public.vehiculo_gasolina where id = :'g2'), true, 'anota cuándo se corrigió');
select test.falla(format($$select public.corregir_gasolina(%L, 0, %L::date, null)$$, :'g2', :'hoy'), 'total', 'al corregir el total sigue siendo obligatorio');
select test.como(pg_temp.yo('c2'));
select test.falla(format($$select public.corregir_gasolina(%L, 1, %L::date, null)$$, :'g2', :'hoy'), 'permiso', 'otro trabajador no corrige cargas ajenas');
select test.como(pg_temp.yo('a1'));
select public.corregir_gasolina(:'g2', 80.00, :'hoy'::date, 48700);
select test.igual((select total from public.vehiculo_gasolina where id = :'g2'), 80.00::numeric, 'el admin también corrige');
select public.registrar_gasolina(:'v2', 40.00, '00000000-0000-0000-0000-0000000000e1/gasolina/r4.jpg', 'r4.jpg', 900) as g3 \gset
select test.igual((select millas from public.vehiculos where id = :'v2'), 1000, 'el admin puede registrar millas menores sin bajar las del vehículo');

-- quitar: solo admin
select test.como(pg_temp.yo('c1'));
select test.falla(format($$select public.quitar_gasolina(%L)$$, :'g2'), 'permiso', 'el conductor no quita cargas');
select test.como(pg_temp.yo('a1'));
select public.quitar_gasolina(:'g2');
select test.igual((select count(*)::int from public.vehiculo_gasolina where activo), 2, 'una carga quitada ya no está activa');
select test.falla(format($$select public.corregir_gasolina(%L, 10, %L::date, null)$$, :'g2', :'hoy'), 'no encontrada', 'una carga quitada no se corrige');

rollback;
