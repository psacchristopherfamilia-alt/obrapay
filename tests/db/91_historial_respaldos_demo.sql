-- Fase C: historial, exportar todo, respaldos y compañía de demostración.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create or replace function pg_temp.hacer_plataforma(p_perfil uuid) returns void language sql security definer as $f$
  insert into public.plataforma_duenos (perfil_id) values (p_perfil) $f$;
create or replace function pg_temp.evento(p_empresa uuid, p_tipo text, p_det jsonb) returns void language sql security definer as $f$
  select public._evento(p_empresa, p_tipo, p_det) $f$;
create or replace function pg_temp.cuenta(p_tabla text, p_empresa uuid) returns int language plpgsql security definer as $f$
declare n int;
begin execute format('select count(*)::int from public.%I where empresa_id = $1', p_tabla) into n using p_empresa; return n; end $f$;
create or replace function pg_temp.cuenta_semanas(p_empresa uuid, p_estado text) returns int language sql security definer as $f$
  select count(*)::int from public.semanas where empresa_id = p_empresa and estado = p_estado $f$;
create or replace function pg_temp.usuarios_demo() returns int language sql security definer as $f$
  select count(*)::int from auth.users where email like '%@demo.invalid' or email = 'demo.obrapay@obrapay.local' $f$;
create or replace function pg_temp.neto_negativo(p_empresa uuid) returns int language sql security definer as $f$
  select count(*)::int from public.nomina_semanal where empresa_id = p_empresa and neto <= 0 $f$;
create or replace function pg_temp.ids_demo(p_empresa uuid) returns text language sql security definer as $f$
  select string_agg(id::text, ',' order by id) from public.perfiles where empresa_id = p_empresa $f$;
create or replace function pg_temp.cias_en_respaldo(p_id uuid) returns int language sql security definer as $f$
  select (select count(*)::int from jsonb_object_keys(datos -> 'companias')) from public.respaldos where id = p_id $f$;
create or replace function pg_temp.respaldo_tiene(p_id uuid, p_empresa uuid) returns boolean language sql security definer as $f$
  select (datos -> 'companias') ? p_empresa::text from public.respaldos where id = p_id $f$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.hacer_plataforma(pg_temp.yo('c3'));
select pg_temp.evento('00000000-0000-0000-0000-0000000000e1', 'cambio_tarifa',
  jsonb_build_object('perfil', pg_temp.yo('c1'), 'antes', 17, 'despues', 18, 'desde', '2026-10-01'));
select pg_temp.evento('00000000-0000-0000-0000-0000000000e1', 'semana_cerrada', jsonb_build_object('semana', 'no-es-un-uuid'));

set role authenticated;

-- Historial: el administrador ve el de su compañía; un trabajador no ve nada.
select test.como(pg_temp.yo('a1'));
select test.igual((select count(*)::int from public.historial()), 2, 'el admin ve el historial de su compañía');
select test.igual((select sobre from public.historial(p_tipos => array['cambio_tarifa'])), 'Juan Pérez', 'el historial dice a qué persona se refiere el cambio');
select test.igual((select count(*)::int from public.historial(p_tipos => array['semana_cerrada'])), 1, 'filtra por tipo (y un id roto no tumba la lista)');
select test.igual((select count(*)::int from public.historial(p_limite => 1)), 1, 'respeta el límite');
select test.igual((select count(*)::int from public.historial(p_antes => now() - interval '1 day')), 0, 'respeta la fecha');
select test.falla($$select * from public.historial(p_todas => true)$$, 'permiso', 'el admin no ve todas las compañías');
select test.falla($$select * from public.historial('00000000-0000-0000-0000-0000000000f9')$$, 'permiso', 'el admin no pide otra compañía');
select test.como(pg_temp.yo('c1'));
select test.falla($$select * from public.historial()$$, 'permiso', 'el trabajador no ve el historial');
select test.falla($$select public.exportar_todo()$$, 'permiso', 'el trabajador no exporta');

-- Exportar todo
select test.como(pg_temp.yo('a1'));
select test.igual((select jsonb_array_length(public.exportar_todo() -> 'perfiles') >= 8), true, 'exportar trae a las personas');
select test.igual((public.exportar_todo() ? 'turnos') and (public.exportar_todo() ? 'nomina_semanal') and (public.exportar_todo() ? 'eventos_admin'), true, 'exportar trae horas, nómina e historial');
select test.igual((public.exportar_todo() ? 'notificaciones') or (public.exportar_todo() ? 'pagos_plataforma'), false, 'exportar no trae avisos personales ni cobros de la plataforma');
select test.igual((public.exportar_todo() -> 'empresa') ? 'marca_logo', false, 'exportar no arrastra el logo en base64');

-- Plataforma
select test.como(pg_temp.yo('c3'));
select test.igual((select count(*)::int from public.historial(p_todas => true)) >= 3, true, 'el dueño de la plataforma ve todas');
select test.igual((select count(*)::int from public.historial('00000000-0000-0000-0000-0000000000e1') where tipo = 'exportar_todo') >= 1, true, 'o la de una compañía (y se ve quién exportó los datos)');

-- Respaldos
select test.como(pg_temp.yo('a1'));
select test.falla($$select * from public.plataforma_respaldos()$$, 'permiso', 'el admin no ve respaldos');
select test.falla($$select public.plataforma_respaldar_ahora()$$, 'permiso', 'el admin no crea respaldos');
select test.como(pg_temp.yo('c3'));
select public.plataforma_respaldar_ahora() as rb \gset
select test.igual((select count(*)::int from public.plataforma_respaldos() where tipo = 'manual'), 1, 'queda un respaldo manual');
select test.igual((select tamano > 0 and filas > 0 and companias >= 1 from public.plataforma_respaldos() where id = :'rb'), true, 'el respaldo dice su tamaño y filas');
select test.igual(public.plataforma_respaldo(:'rb') ? 'companias', true, 'se puede descargar completo');
select test.falla($$select public.plataforma_respaldo('00000000-0000-0000-0000-0000000000f9')$$, 'no encontrado', 'respaldo inexistente');
do $$ begin for i in 1..11 loop perform public.plataforma_respaldar_ahora(); end loop; end $$;
select test.igual((select count(*)::int from public.plataforma_respaldos() where tipo = 'manual'), 10, 'se conservan solo 10 manuales');

-- Demo
select test.como(pg_temp.yo('a1'));
select test.falla($$select public.plataforma_crear_demo()$$, 'permiso', 'el admin no crea la demo');
select test.como(pg_temp.yo('c3'));
select public.plataforma_crear_demo() as demo \gset
select test.igual(public.plataforma_crear_demo(), :'demo'::uuid, 'crear la demo dos veces no duplica');
select test.igual((select demo from public.plataforma_panel() where empresa_id = :'demo'), true, 'el panel la marca como demo');
select test.igual((select precio from public.plataforma_panel() where empresa_id = :'demo'), 0::numeric, 'no cobra');
select test.igual((select trabajadores from public.plataforma_panel() where empresa_id = :'demo'), 10, 'trae 10 trabajadores');
select test.igual((select obras from public.plataforma_panel() where empresa_id = :'demo'), 3, 'trae 3 obras');
select test.igual((select vehiculos from public.plataforma_panel() where empresa_id = :'demo'), 2, 'trae 2 vehículos');
select test.igual(pg_temp.cuenta_semanas(:'demo', 'pagada'), 5, 'cinco semanas pagadas');
select test.igual(pg_temp.cuenta_semanas(:'demo', 'cerrada'), 1, 'una cerrada por pagar');
select test.igual(pg_temp.cuenta_semanas(:'demo', 'abierta') >= 1, true, 'y la semana actual abierta');
select test.igual(pg_temp.cuenta('nomina_semanal', :'demo') >= 50, true, 'hay nómina congelada de las semanas cerradas');
select test.igual(pg_temp.neto_negativo(:'demo'), 0, 'ninguna nómina de la demo queda en cero o negativa');
select test.igual(pg_temp.cuenta('vehiculo_gasolina', :'demo'), 12, 'hay gasolina');
select test.igual(pg_temp.cuenta('gastos', :'demo'), 10, 'hay gastos');
select test.igual(pg_temp.cuenta('presupuestos', :'demo'), 3, 'hay presupuestos');
select test.igual((select count(*)::int from public.historial(:'demo') where tipo = 'semana_cerrada'), 6, 'el historial de la demo muestra los cierres');

-- la demo no entra a los respaldos
select public.plataforma_respaldar_ahora() as rb2 \gset
select test.igual(pg_temp.respaldo_tiene(:'rb2', :'demo'), false, 'el respaldo no incluye la demo');
select test.igual(pg_temp.respaldo_tiene(:'rb2', '00000000-0000-0000-0000-0000000000e1'), true, 'pero sí las compañías reales');

-- reiniciar
select pg_temp.ids_demo(:'demo') as antes \gset
select public.plataforma_reiniciar_demo(:'demo');
select test.igual((select trabajadores from public.plataforma_panel() where empresa_id = :'demo'), 10, 'tras reiniciar sigue con 10 trabajadores');
select test.igual(pg_temp.cuenta_semanas(:'demo', 'pagada'), 5, 'y 5 semanas pagadas (no se duplican)');
select test.igual(pg_temp.cuenta('gastos', :'demo'), 10, 'y 10 gastos');
select test.igual(pg_temp.ids_demo(:'demo') = :'antes', false, 'son personas nuevas');
select test.igual(pg_temp.usuarios_demo(), 12, 'no deja usuarios huérfanos (12 en total)');
select test.igual((select count(*)::int from public.historial(:'demo') where tipo = 'semana_cerrada'), 6, 'el historial de la demo se reconstruye, no se acumula');

-- no se puede reiniciar una compañía real
select test.falla($$select public.plataforma_reiniciar_demo('00000000-0000-0000-0000-0000000000e1')$$, 'demostración', 'no se reinicia una compañía real');
select test.como(pg_temp.yo('a1'));
select test.falla($$select public.plataforma_reiniciar_demo('00000000-0000-0000-0000-0000000000e1')$$, 'permiso', 'el admin no reinicia nada');
rollback;
