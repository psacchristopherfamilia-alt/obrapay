-- Pruebas de permisos (RLS): qué ve y qué puede cambiar cada rol leyendo las tablas directamente.
begin;

create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;

-- Datos: turnos en los tres proyectos, un préstamo y un evento
select test.turno('c1', 'f1', '2026-10-08', '07:00', '15:00');
select test.turno('c2', 'f2', '2026-10-08', '07:00', '15:00');
select test.turno('c4', 'f3', '2026-10-08', '07:00', '15:00');
insert into public.prestamos (empresa_id, perfil_id, monto_total) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', 200);
insert into public.eventos_admin (empresa_id, tipo) values ('00000000-0000-0000-0000-0000000000e1', 'prueba');
insert into public.notificaciones (empresa_id, perfil_id, tipo) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', 'prueba');

-- Otra empresa, para probar el aislamiento entre empresas
insert into public.empresas (id, nombre) values ('00000000-0000-0000-0000-0000000000e2', 'Otra empresa');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a2');
insert into public.perfiles (id, empresa_id, usuario, nombre, roles) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e2', 'admin', 'Admin 2', array['admin']);

set role authenticated;

-- ---------------------------------------------------------------------------
-- Trabajador
-- ---------------------------------------------------------------------------
select test.como(pg_temp.yo('c1'));
select test.igual((select count(*)::int from public.turnos where perfil_id <> pg_temp.yo('c1')), 0, 'trabajador: no ve turnos ajenos');
select test.ok((select count(*) from public.turnos) > 0, 'trabajador: ve sus turnos');
select test.igual((select count(*)::int from public.perfiles), 1, 'trabajador: solo ve su perfil');
select test.igual((select count(*)::int from public.tarifas where perfil_id <> pg_temp.yo('c1')), 0, 'trabajador: no ve tarifas ajenas');
select test.igual((select count(*)::int from public.prestamos), 0, 'trabajador: no ve préstamos ajenos');
select test.igual((select count(*)::int from public.notificaciones), 0, 'trabajador: no ve avisos ajenos');
select test.igual((select count(*)::int from public.eventos_admin), 0, 'trabajador: no ve la bitácora');
select test.igual((select count(*)::int from public.proyectos), 3, 'trabajador: ve los proyectos de su empresa');

update public.perfiles set roles = array['admin'] where id = pg_temp.yo('c1');
select test.igual((select roles from public.perfiles where id = pg_temp.yo('c1')), array['trabajador'], 'trabajador: no puede darse rol de admin');
select test.falla($$update public.perfiles set debe_cambiar_clave = false$$, 'permission denied', 'trabajador: no edita columnas protegidas');
select test.falla($$insert into public.proyectos (empresa_id, nombre) values ('00000000-0000-0000-0000-0000000000e1', 'Falso')$$, 'row-level security', 'trabajador: no crea proyectos');
select test.falla($$update public.notificaciones set perfil_id = '00000000-0000-0000-0000-0000000000c1'$$, 'permission denied', 'trabajador: no reasigna avisos');
select test.falla($$delete from public.turnos$$, 'permission denied', 'trabajador: no borra turnos');
select public.cambiar_idioma('ht');
select test.igual((select idioma from public.perfiles where id = pg_temp.yo('c1')), 'ht', 'trabajador: cambia su idioma a criollo');

-- ---------------------------------------------------------------------------
-- Supervisor (Ramón: Villa Grace Bay y Taylor Bay)
-- ---------------------------------------------------------------------------
select test.como(pg_temp.yo('b1'));
select test.igual((select count(*)::int from public.turnos where proyecto_id = pg_temp.yo('f2')), 0, 'supervisor: no ve turnos de Leeward Plaza');
select test.igual((select count(*)::int from public.turnos where proyecto_id in (pg_temp.yo('f1'), pg_temp.yo('f3'))), 2, 'supervisor: ve los turnos de sus dos proyectos');
select test.ok(not exists (select 1 from public.perfiles where id = pg_temp.yo('c2')), 'supervisor: no ve a quien no supervisa');
select test.ok(exists (select 1 from public.perfiles where id = pg_temp.yo('c4')), 'supervisor: ve a su equipo');
select test.igual((select count(*)::int from public.tarifas), 0, 'supervisor: no ve tarifas');
select test.igual((select count(*)::int from public.nomina_semanal), 0, 'supervisor: no ve nómina ajena');

-- ---------------------------------------------------------------------------
-- Admin y dueño
-- ---------------------------------------------------------------------------
select test.como(pg_temp.yo('a1'));
select test.igual((select count(*)::int from public.turnos), 3, 'admin: ve todos los turnos de la empresa');
select test.ok((select count(*) from public.tarifas) >= 6, 'admin: ve todas las tarifas');
insert into public.proyectos (empresa_id, nombre) values ('00000000-0000-0000-0000-0000000000e1', 'Proyecto nuevo');
select test.igual((select count(*)::int from public.proyectos), 4, 'admin: crea proyectos');
update public.empresas set gps_activo = true;
select test.igual((select gps_activo from public.empresas), true, 'admin: cambia ajustes de la empresa');

select test.como(pg_temp.yo('d1'));
select test.igual((select count(*)::int from public.turnos), 3, 'dueño: ve todos los turnos');
select test.ok((select count(*) from public.eventos_admin) >= 1, 'dueño: ve la bitácora');
update public.empresas set gps_activo = false;
select test.igual((select gps_activo from public.empresas), true, 'dueño: no cambia ajustes (solo lectura)');
select test.falla($$insert into public.proyectos (empresa_id, nombre) values ('00000000-0000-0000-0000-0000000000e1', 'X')$$, 'row-level security', 'dueño: no crea proyectos');

-- ---------------------------------------------------------------------------
-- Aislamiento entre empresas y usuarios sin sesión
-- ---------------------------------------------------------------------------
select test.como(pg_temp.yo('a2'));
select test.igual((select count(*)::int from public.turnos), 0, 'otra empresa: no ve turnos ajenos');
select test.igual((select count(*)::int from public.perfiles), 1, 'otra empresa: solo ve su propio perfil');
select test.falla($$insert into public.proyectos (empresa_id, nombre) values ('00000000-0000-0000-0000-0000000000e1', 'Intruso')$$, 'row-level security', 'otra empresa: no escribe en la empresa ajena');

reset role;
set role anon;
select test.como(null);
select test.falla($$select count(*) from public.perfiles$$, 'permission denied', 'sin sesión: no lee nada');
select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f1')$$, 'permission denied', 'sin sesión: no marca');

reset role;
rollback;
