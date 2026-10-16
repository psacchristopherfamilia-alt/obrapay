-- Vehículos: ficha, conductor, millas, planes de mantenimiento, servicios y avisos para el admin.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;

-- "Hoy" según la compañía (igual que usa la base de datos para los avisos).
select public._hoy_empresa('00000000-0000-0000-0000-0000000000e1') as hoy \gset

set role authenticated;
select test.como(pg_temp.yo('a1'));

-- ficha
select public.guardar_vehiculo(null, 'Toyota Hilux 01', 'TCI 4821', 'camioneta', 'Toyota', 'Hilux', 2021, 'MR0FB8CD600123456', pg_temp.yo('c1'), 48210) as v1 \gset
select test.igual((select millas from public.vehiculos where id = :'v1'), 48210, 'el vehículo guarda las millas iniciales');
select test.falla($$select public.guardar_vehiculo(null, 'Otra camioneta', 'tci 4821', 'camioneta', null, null, null, null, null, 0)$$, 'esa placa', 'no repite la placa dentro de la compañía');
select test.falla($$select public.guardar_vehiculo(null, '  ', null, 'camioneta', null, null, null, null, null, 0)$$, 'nombre', 'el vehículo necesita nombre');
select test.falla($$select public.guardar_vehiculo(null, 'Camión', null, 'camioneta', null, null, null, null, '00000000-0000-0000-0000-0000000000ff', 0)$$, 'conductor', 'el conductor debe ser de la compañía');
select test.falla($$select public.guardar_vehiculo(null, 'Foto ajena', null, 'camioneta', null, null, null, null, null, 0, '00000000-0000-0000-0000-0000000000e2/f.jpg', 'f.jpg')$$, 'Archivo inválido', 'no acepta fotos de otra compañía');

-- planes
select public.guardar_plan(null, :'v1', 'Cambio de aceite', 5000, 90, (:'hoy'::date - 80), 45900) as p1 \gset
select test.igual((select count(*)::int from public.notificaciones where tipo = 'mantenimiento_vehiculo'), 1, 'un aceite que vence en 10 días ya avisa al admin');
select test.igual((select datos ->> 'por' from public.notificaciones where tipo = 'mantenimiento_vehiculo'), 'fecha', 'avisa por fecha');
select test.igual((select (datos ->> 'dias')::int from public.notificaciones where tipo = 'mantenimiento_vehiculo'), 10, 'trae los días que faltan');
select test.igual((select datos ->> 'quien' from public.notificaciones where tipo = 'mantenimiento_vehiculo'), 'Toyota Hilux 01 · TCI 4821', 'nombra el vehículo con su placa');
select public.guardar_plan(null, :'v1', 'Frenos', 20000, null, (:'hoy'::date - 30), 38000) as p2 \gset
select public.guardar_plan(null, :'v1', 'Rotación de llantas', 5000, null, :'hoy'::date, 44000) as p3 \gset
select test.igual((select count(*)::int from public.notificaciones where tipo = 'mantenimiento_vehiculo'), 1, 'frenos y llantas están lejos y no avisan');
select test.falla(format($$select public.guardar_plan(null, %L, 'Sin intervalo', null, null)$$, :'v1'), 'cuántas millas', 'un plan necesita millas o días');

-- millas: el conductor asignado y el admin pueden; otros no
select test.como(pg_temp.yo('c1'));
select public.actualizar_millas(:'v1', 48300);
select test.igual((select millas from public.vehiculos where id = :'v1'), 48300, 'el conductor actualiza las millas');
select test.falla(format($$select public.actualizar_millas(%L, 48000)$$, :'v1'), 'menores', 'el conductor no puede bajar las millas');
select test.igual((select count(*)::int from public.vehiculos), 1, 'el conductor ve su vehículo');
select test.igual((select count(*)::int from public.vehiculo_planes), 3, 'el conductor ve los planes de su vehículo');
select test.igual((select count(*)::int from public.vehiculo_servicios), 0, 'el conductor no ve los costos de servicios');
select test.igual((select count(*)::int from public.documentos), 0, 'el conductor no ve documentos');
select test.falla($$select public.guardar_vehiculo(null, 'X', null, 'camioneta', null, null, null, null, null, 0)$$, 'permiso', 'el conductor no puede registrar vehículos');
select test.falla(format($$select public.registrar_servicio(%L)$$, :'p1'), 'permiso', 'el conductor no registra servicios');
select test.como(pg_temp.yo('c2'));
select test.igual((select count(*)::int from public.vehiculos), 0, 'otro trabajador no ve el vehículo');
select test.falla(format($$select public.actualizar_millas(%L, 50000)$$, :'v1'), 'permiso', 'quien no lo maneja no actualiza las millas');

-- las millas disparan el aviso por millas
select test.como(pg_temp.yo('c1'));
select public.actualizar_millas(:'v1', 48600);
select test.como(pg_temp.yo('a1'));
select test.igual((select count(*)::int from public.notificaciones where tipo = 'mantenimiento_vehiculo'), 2, 'las llantas a 400 millas de su servicio avisan');
select test.igual((select datos ->> 'por' from public.notificaciones where datos ->> 'plan' = :'p3'), 'millas', 'el aviso de las llantas es por millas');
select test.igual((select (datos ->> 'millas')::int from public.notificaciones where datos ->> 'plan' = :'p3'), 400, 'trae las millas que faltan');
select public.actualizar_millas(:'v1', 48500);
select test.igual((select millas from public.vehiculos where id = :'v1'), 48500, 'el admin puede corregir las millas a la baja');

-- registrar servicio reinicia el plan
select public.actualizar_millas(:'v1', 48600);
select public.registrar_servicio(:'p1', :'hoy'::date, 48600, 92.50, 'Aceite 5W-30') as s1 \gset
select test.igual((select count(*)::int from public.notificaciones where datos ->> 'plan' = :'p1'), 0, 'al registrar el servicio se quita el aviso');
select test.igual((select ultimo_millas from public.vehiculo_planes where id = :'p1'), 48600, 'el plan se reinicia con las millas del servicio');
select test.igual((select costo from public.vehiculo_servicios where id = :'s1'), 92.50, 'el servicio guarda el costo');
select test.falla(format($$select public.registrar_servicio(%L, %L::date + 3)$$, :'p1', :'hoy'), 'futura', 'el servicio no puede tener fecha futura');

-- dueño: ve todo, no edita
select test.como(pg_temp.yo('d1'));
select test.igual((select count(*)::int from public.vehiculos), 1, 'el dueño ve los vehículos');
select test.igual((select count(*)::int from public.vehiculo_servicios), 1, 'el dueño ve los servicios');
select test.falla(format($$select public.actualizar_millas(%L, 49000)$$, :'v1'), 'permiso', 'el dueño no actualiza millas');
select test.falla($$select public.guardar_vehiculo(null, 'Y', null, 'camioneta', null, null, null, null, null, 0)$$, 'permiso', 'el dueño no registra vehículos');

-- aviso diario: vuelve a salir sin leer hasta que se haga el servicio
select test.como(pg_temp.yo('a1'));
update public.notificaciones set leida = true where tipo = 'mantenimiento_vehiculo';
reset role;
select test.igual((select public.avisar_vehiculos(now() + interval '1 day')), 1, 'solo las llantas están dentro de su ventana');
set role authenticated;
select test.como(pg_temp.yo('a1'));
select test.igual((select count(*)::int from public.notificaciones where tipo = 'mantenimiento_vehiculo' and not leida), 1, 'al día siguiente el aviso vuelve a salir sin leer');
select test.igual((select count(*)::int from public.notificaciones where tipo = 'mantenimiento_vehiculo'), 1, 'sigue habiendo un solo aviso por plan');

-- documentos del vehículo y baja
select public.guardar_documento(null, 'seguro_vehiculo', null, null, 'POL-1', (:'hoy'::date + 5), null, null, :'v1') as dv \gset
select public.guardar_documento(null, 'inspeccion_vehiculo', null, null, 'INS-1', (:'hoy'::date + 200), null, null, :'v1');
select test.igual((select count(*)::int from public.notificaciones where tipo = 'documento_por_vencer' and datos ->> 'vehiculo' = :'v1'), 1, 'el seguro del vehículo a 5 días avisa y la inspección lejana no');
select public.quitar_vehiculo(:'v1');
select test.igual((select count(*)::int from public.notificaciones where tipo in ('mantenimiento_vehiculo', 'documento_por_vencer')), 0, 'al quitar el vehículo se limpian todos sus avisos');
select test.igual((select count(*)::int from public.vehiculo_planes where activo), 0, 'los planes del vehículo quedan inactivos');
select test.igual((select count(*)::int from public.documentos where vehiculo_id = :'v1' and activo), 0, 'los documentos del vehículo quedan inactivos');
select test.como(pg_temp.yo('c1'));
select test.igual((select count(*)::int from public.vehiculos), 0, 'el conductor ya no ve un vehículo dado de baja');

rollback;
