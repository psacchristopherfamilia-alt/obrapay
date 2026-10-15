-- Vencimientos de documentos: permisos, licencias y seguros con avisos para el admin.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;

set role authenticated;
select test.como(pg_temp.yo('a1'));

select public.guardar_documento(null, 'permiso_trabajo', pg_temp.yo('c1'), null, 'WP-1', (current_date + 20), '00000000-0000-0000-0000-0000000000e1/permiso.pdf', 'permiso.pdf') as lejos \gset
select test.falla($$select public.guardar_documento(null, 'permiso_trabajo', '00000000-0000-0000-0000-0000000000c1', null, 'WP-1', current_date + 20, '00000000-0000-0000-0000-0000000000e2/a.pdf', 'a.pdf')$$, 'Archivo inválido', 'no acepta archivos de otra compañía');
select test.falla($$select public.guardar_documento(null, 'seguro_vehiculo', null, '  ', null, current_date + 20)$$, 'violates check', 'el seguro necesita el nombre del vehículo');
select test.falla($$select public.guardar_documento(null, 'licencia_conducir', null, null, null, current_date + 20)$$, 'Elige un trabajador', 'la licencia de conducir necesita un trabajador');

select test.igual((select count(*)::int from public.notificaciones where tipo = 'documento_por_vencer'), 1, 'un permiso que vence en 20 días ya avisa al admin');
select test.igual((select (datos ->> 'dias')::int from public.notificaciones where tipo = 'documento_por_vencer' and perfil_id = pg_temp.yo('a1')), 20, 'el aviso trae los días que faltan');
select test.igual((select datos ->> 'quien' from public.notificaciones where tipo = 'documento_por_vencer'), 'Juan Pérez', 'el aviso nombra al trabajador');

select public.guardar_documento(null, 'permiso_trabajo', pg_temp.yo('c2'), null, null, (current_date + 120));
select test.igual((select count(*)::int from public.notificaciones where tipo = 'documento_por_vencer'), 1, 'un permiso que vence en 120 días todavía no avisa (la ventana es 90)');
select public.guardar_documento(null, 'licencia_conducir', pg_temp.yo('c3'), null, null, (current_date + 45));
select test.igual((select count(*)::int from public.notificaciones where tipo = 'documento_por_vencer'), 1, 'una licencia de conducir a 45 días todavía no avisa (la ventana es 30)');
select public.guardar_documento(null, 'seguro_vehiculo', null, 'Toyota Hilux · TCI 4821', 'POL-1', (current_date + 10));
select public.guardar_documento(null, 'licencia_construccion', null, null, 'BL-1', (current_date - 3));
select test.igual((select count(*)::int from public.notificaciones where tipo = 'documento_por_vencer'), 3, 'el seguro a 10 días y la licencia vencida avisan');
select test.igual((select datos ->> 'quien' from public.notificaciones where datos ->> 'doc_tipo' = 'licencia_construccion'), 'Empresa de prueba', 'la licencia de construcción usa el nombre de la compañía');
select test.igual((select (datos ->> 'dias')::int from public.notificaciones where datos ->> 'doc_tipo' = 'licencia_construccion'), -3, 'un documento vencido muestra los días en negativo');

-- aviso diario: reaparece sin leer hasta que se renueve
update public.notificaciones set leida = true where tipo = 'documento_por_vencer';
reset role;
select public.avisar_documentos(now() + interval '1 day');
set role authenticated;
select test.como(pg_temp.yo('a1'));
select test.igual((select count(*)::int from public.notificaciones where tipo = 'documento_por_vencer' and not leida), 3, 'al día siguiente los avisos vuelven a salir sin leer');
select test.igual((select count(*)::int from public.notificaciones where tipo = 'documento_por_vencer'), 3, 'sigue habiendo un solo aviso por documento');

-- renovar
select test.falla(format($$select public.renovar_documento(%L, current_date + 5)$$, :'lejos'), 'posterior', 'la renovación debe tener una fecha posterior');
select public.renovar_documento(:'lejos', (current_date + 400), 'WP-2', '00000000-0000-0000-0000-0000000000e1/nuevo.pdf', 'nuevo.pdf') as nuevo \gset
select test.igual((select activo from public.documentos where id = :'lejos'), false, 'el documento anterior queda inactivo');
select test.igual((select numero from public.documentos where id = :'nuevo'), 'WP-2', 'el documento nuevo guarda el número nuevo');
select test.igual((select reemplaza_id from public.documentos where id = :'nuevo'), :'lejos'::uuid, 'el nuevo documento recuerda a cuál reemplaza');
select test.igual((select count(*)::int from public.notificaciones where datos ->> 'documento' = :'lejos'), 0, 'al renovar se quita el aviso');
select test.igual((select count(*)::int from public.notificaciones where datos ->> 'documento' = :'nuevo'), 0, 'con 400 días por delante no hay aviso');

-- permisos
select test.igual((select count(*)::int from public.documentos), 6, 'el admin ve los documentos de su compañía (incluye el historial)');
select test.como(pg_temp.yo('c1'));
select test.igual((select count(*)::int from public.documentos), 0, 'un trabajador no ve documentos');
select test.falla($$select public.guardar_documento(null, 'seguro_vehiculo', null, 'X', null, current_date + 5)$$, 'permiso', 'un trabajador no puede guardar documentos');
select test.como(pg_temp.yo('d1'));
select test.igual((select count(*)::int from public.documentos), 6, 'el dueño puede ver los documentos');
select test.falla($$select public.quitar_documento(gen_random_uuid())$$, 'permiso', 'el dueño no puede quitar documentos');

rollback;
