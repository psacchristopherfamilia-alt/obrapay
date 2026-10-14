-- Herramientas: inventario por compañía, a cargo de supervisor, encargada a trabajador, estados, préstamo entre compañías.
--   e1 = compañía de prueba · e2 = segunda compañía · b3 = supervisor de e2 · f4 = proyecto de e2
--   Ramón (b1) supervisa f1 y f3 → Juan (c1), Carlos (c3), Jean (c4) y Pedro (c5). Marie (c2) es de A. Louis (b2).
begin;

create or replace function pg_temp.id(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create or replace function pg_temp.en(p text) returns void language sql as $$
  select set_config('request.headers',
    case when p is null then '' else json_build_object('x-empresa-id', pg_temp.id(p))::text end, false) $$;

insert into public.empresas (id, nombre) values (pg_temp.id('e2'), 'Compañía dos');
insert into auth.users (id, email) values (pg_temp.id('b3'), 'sup3@obrapay.local');
insert into public.perfiles (id, empresa_id, usuario, nombre, roles)
values (pg_temp.id('b3'), pg_temp.id('e2'), 'sup3', 'Supervisor dos', array['supervisor']);
insert into public.perfil_empresas (perfil_id, empresa_id) values (pg_temp.id('a1'), pg_temp.id('e2')), (pg_temp.id('d1'), pg_temp.id('e2'));
insert into public.proyectos (id, empresa_id, nombre) values (pg_temp.id('f4'), pg_temp.id('e2'), 'Obra compañía dos');

-- Quién puede crear
set role authenticated;
select test.como(pg_temp.id('b1'));
select pg_temp.en('e1');
select test.falla($q$select public.crear_herramienta('Taladro')$q$, 'No tienes permiso', 'un supervisor no crea herramientas');
select test.como(pg_temp.id('a1'));
select pg_temp.en('e1');
select test.falla($q$select public.crear_herramienta('  ')$q$, 'Falta el nombre', 'la herramienta necesita nombre');
select public.crear_herramienta('Taladro', 'TAL-1', 120, 'Con maletín');
select public.crear_herramienta('Escalera', 'ESC-1', 80);
create temp table ids as select
  (select id from public.herramientas_inventario() where nombre = 'Taladro') as tal,
  (select id from public.herramientas_inventario() where nombre = 'Escalera') as esc;
grant select on ids to authenticated;
select test.igual((select count(*)::int from public.herramientas_inventario()), 2, 'el admin ve las dos herramientas de su compañía');
select test.igual((select valor from public.herramientas_inventario() where nombre = 'Taladro'), 120.00::numeric, 'el valor queda guardado');

-- Visibilidad del supervisor: solo lo que tiene a cargo
select test.como(pg_temp.id('b1'));
select test.igual((select count(*)::int from public.herramientas_inventario()), 0, 'sin asignar, el supervisor no ve nada');
select test.como(pg_temp.id('a1'));
select public.herramienta_a_supervisor((select tal from ids), pg_temp.id('b1'), pg_temp.id('f1'));
select test.falla(format($q$select public.herramienta_a_supervisor(%L, %L, null)$q$, (select tal from ids), pg_temp.id('c1')), 'no pertenece', 'solo se asigna a supervisores');
select test.falla(format($q$select public.herramienta_a_supervisor(%L, %L, %L)$q$, (select tal from ids), pg_temp.id('b1'), pg_temp.id('f4')), 'proyecto no pertenece', 'el proyecto debe ser de la compañía que la usa');
select test.como(pg_temp.id('b1'));
select test.igual((select count(*)::int from public.herramientas_inventario()), 1, 'el supervisor ve la herramienta a su cargo');
select test.igual((select proyecto from public.herramientas_inventario()), 'Villa Grace Bay', 'con su proyecto');
select test.como(pg_temp.id('b2'));
select test.igual((select count(*)::int from public.herramientas_inventario()), 0, 'otro supervisor no la ve');
select test.falla(format($q$select public.herramienta_a_trabajador(%L, %L)$q$, (select tal from ids), pg_temp.id('c1')), 'no encontrada', 'otro supervisor no puede encargarla');

-- Encargar a un trabajador
select test.como(pg_temp.id('b1'));
select test.falla(format($q$select public.herramienta_a_trabajador(%L, %L)$q$, (select tal from ids), pg_temp.id('c2')), 'tus trabajadores', 'solo a sus propios trabajadores');
select public.herramienta_a_trabajador((select tal from ids), pg_temp.id('c1'));
select test.igual((select trabajador from public.herramientas_inventario()), 'Juan Pérez', 'queda encargada a Juan');
select test.igual((select count(distinct id)::int from public.herramientas_personas() where tipo = 'trabajador'), 4, 'sus trabajadores: Juan, Carlos, Jean y Pedro');
select test.igual((select count(*)::int from public.herramientas_personas() where id = pg_temp.id('c2')), 0, 'Marie no es suya');
select public.herramienta_a_trabajador((select tal from ids), null);
select test.ok((select trabajador_id is null from public.herramientas_inventario()), 'al recibirla de vuelta vuelve al supervisor');
select public.herramienta_a_trabajador((select tal from ids), pg_temp.id('c4'));

-- El trabajador no ve inventario
select test.como(pg_temp.id('c1'));
select test.falla($q$select * from public.herramientas_inventario()$q$, 'No tienes permiso', 'un trabajador no ve el inventario');

-- Estados
select test.como(pg_temp.id('b1'));
select test.falla(format($q$select public.herramienta_estado(%L, 'danado')$q$, (select tal from ids)), 'qué pasó', 'dañada pide explicar qué pasó');
select public.herramienta_estado((select tal from ids), 'danado', 'Se cayó del andamio');
select test.igual((select estado from public.herramientas_inventario()), 'danado', 'queda dañada');
select public.herramienta_estado((select tal from ids), 'perdido', 'No apareció al cerrar la obra');
select test.falla(format($q$select public.herramienta_a_trabajador(%L, %L)$q$, (select tal from ids), pg_temp.id('c3')), 'perdida', 'una perdida no se asigna');
select test.falla(format($q$select public.herramienta_estado(%L, 'baja')$q$, (select tal from ids)), 'compañía dueña', 'solo el admin da de baja');
select test.como(pg_temp.id('a1'));
select public.herramienta_estado((select tal from ids), 'bueno', 'Apareció');
select test.igual((select estado from public.herramientas_inventario() where id = (select tal from ids)), 'bueno', 'el admin la devuelve a buena');
select test.ok((select count(*) >= 5 from public.herramienta_movimientos((select tal from ids))), 'el historial guarda cada movimiento');

-- Préstamo a la otra compañía
select public.compartir_herramienta((select esc from ids), pg_temp.id('e2'));
select test.igual((select empresa_uso from public.herramientas_inventario() where id = (select esc from ids)), 'Compañía dos', 'la escalera queda prestada a la compañía dos');
select test.falla(format($q$select public.herramienta_a_supervisor(%L, %L, null)$q$, (select esc from ids), pg_temp.id('b1')), 'no pertenece', 'el supervisor de otra compañía no la recibe');
select public.herramienta_a_supervisor((select esc from ids), pg_temp.id('b3'), pg_temp.id('f4'));
select test.falla(format($q$select public.compartir_herramienta(%L, %L)$q$, (select esc from ids), pg_temp.id('e2')), 'ya está', 'no se presta dos veces a la misma');
select test.como(pg_temp.id('b3'));
select test.igual((select count(*)::int from public.herramientas_inventario()), 1, 'el supervisor de la dos ve la prestada');
select test.como(pg_temp.id('a1'));
select public.compartir_herramienta((select esc from ids), null);
select test.ok((select empresa_uso_id is null and supervisor_id is null from public.herramientas_inventario() where id = (select esc from ids)), 'al devolverla vuelve a su compañía y al almacén');

-- Dueño: solo lectura
select test.como(pg_temp.id('d1'));
select test.igual((select count(*)::int from public.herramientas_inventario()), 2, 'el dueño ve todo el inventario');
select test.falla(format($q$select public.herramienta_a_supervisor(%L, %L, null)$q$, (select tal from ids), pg_temp.id('b1')), 'no encontrada', 'el dueño no asigna');
select test.falla($q$select public.crear_herramienta('Sierra')$q$, 'No tienes permiso', 'el dueño no crea');

-- Baja: sale de los supervisores y del trabajador
select test.como(pg_temp.id('a1'));
select public.herramienta_estado((select tal from ids), 'baja', 'Obsoleta');
select test.ok((select supervisor_id is null and trabajador_id is null and estado = 'baja' from public.herramientas_inventario() where id = (select tal from ids)), 'la baja libera supervisor y trabajador');
select test.falla(format($q$select public.herramienta_estado(%L, 'bueno')$q$, (select tal from ids)), 'baja', 'una herramienta de baja no se reactiva');
reset role;

rollback;
