-- ============================================================================
-- Pruebas de RLS — Materiales, Equipo, Documentos, rol Comprador
-- (Cortes 24, 26, 28, 30)
--
-- Mismo estilo que rls.test.sql: transacción propia, fixtures propios con
-- un prefijo de UUID distinto (c/d en vez de a/b) para no chocar si algún
-- día ambos archivos corren en la misma sesión de base de datos.
--
-- Fuera de alcance a propósito: la regla "un Admin no puede crear otro
-- Admin" (Corte 23) vive en app/admin/trabajadores/actions.ts, en código
-- de aplicación — no en una política de RLS. pgTAP prueba el límite de
-- la base de datos, no el de un Server Action; esa regla no tiene un
-- equivalente aquí que probar.
-- ============================================================================

begin;
select plan(21);

create or replace function pg_temp.autenticar_como(p_id uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text)::text, true);
  set local role authenticated;
end;
$$ language plpgsql;

create or replace function pg_temp.salir_sesion() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$ language plpgsql;

-- ---- Fixtures ----------------------------------------------------------
insert into empresas (id, nombre, estado) values
  ('c0000000-0000-0000-0000-00000000000c', 'Empresa C', 'active'),
  ('d0000000-0000-0000-0000-00000000000d', 'Empresa D', 'active');

insert into usuarios (id, empresa_id, nombre, email, rol) values
  ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'Admin C', 'adminc@test.com', 'admin'),
  ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'Supervisor C1', 'supc1@test.com', 'supervisor'),
  ('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-00000000000c', 'Supervisor C2', 'supc2@test.com', 'supervisor'),
  ('c0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-00000000000c', 'Trabajador C1', 'tc1@test.com', 'trabajador'),
  ('c0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-00000000000c', 'Comprador C1', 'compc1@test.com', 'comprador'),
  ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Admin D', 'admind@test.com', 'admin');

insert into proyectos (id, empresa_id, nombre, supervisor_principal_id, presupuesto) values
  ('c0000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-00000000000c', 'Proyecto C1', 'c0000000-0000-0000-0000-000000000002', 5000),
  ('c0000000-0000-0000-0000-0000000000f2', 'c0000000-0000-0000-0000-00000000000c', 'Proyecto C2', 'c0000000-0000-0000-0000-000000000003', 5000);

-- ============================================================================
-- Grupo A — Materiales: solo el Admin escribe el catálogo
-- ============================================================================

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000004'); -- Trabajador C1

select throws_ok(
  $$ insert into materiales_catalogo (empresa_id, nombre, unidad) values ('c0000000-0000-0000-0000-00000000000c', 'Cemento', 'saco') $$,
  'new row violates row-level security policy for table "materiales_catalogo"',
  'Un trabajador NO puede agregar un material al catálogo'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000001'); -- Admin C

select lives_ok(
  $$ insert into materiales_catalogo (id, empresa_id, nombre, unidad)
     values ('c0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000c', 'Cemento', 'saco') $$,
  'El Admin sí puede agregar un material al catálogo'
);

-- ============================================================================
-- Grupo B — Materiales: quién puede registrar una compra
-- ============================================================================

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000004'); -- Trabajador C1

select throws_ok(
  $$ insert into compras_materiales (empresa_id, material_id, cantidad, costo_total)
     values ('c0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-0000000000a1', 10, 100) $$,
  'new row violates row-level security policy for table "compras_materiales"',
  'Un trabajador NO puede registrar una compra de material'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000002'); -- Supervisor C1

select lives_ok(
  $$ insert into compras_materiales (id, empresa_id, material_id, cantidad, costo_total)
     values ('c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-0000000000a1', 10, 100) $$,
  'Un Supervisor sí puede registrar una compra de material'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000005'); -- Comprador C1

select lives_ok(
  $$ insert into compras_materiales (id, empresa_id, material_id, cantidad, costo_total)
     values ('c0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-0000000000a1', 20, 200) $$,
  'El rol Comprador sí puede registrar una compra de material'
);

-- ============================================================================
-- Grupo C — Entregas: aislamiento entre supervisores + Admin ve todo
-- ============================================================================

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000002'); -- Supervisor C1

select lives_ok(
  $$ insert into entregas_materiales (compra_id, proyecto_id, cantidad, costo_asignado, entregado_por)
     values ('c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000f1', 10, 100, 'c0000000-0000-0000-0000-000000000002') $$,
  'Supervisor C1 puede entregar material a SU proyecto'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000003'); -- Supervisor C2

select is_empty(
  $$ select * from entregas_materiales where proyecto_id = 'c0000000-0000-0000-0000-0000000000f1' $$,
  'Supervisor C2 NO ve la entrega hecha al proyecto de Supervisor C1'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000001'); -- Admin C

select isnt_empty(
  $$ select * from entregas_materiales where proyecto_id = 'c0000000-0000-0000-0000-0000000000f1' $$,
  'El Admin sí ve la entrega, sin importar qué supervisor la registró'
);

-- ============================================================================
-- Grupo D — Aislamiento entre EMPRESAS (materiales)
-- ============================================================================

select pg_temp.autenticar_como('d0000000-0000-0000-0000-000000000001'); -- Admin D

select is_empty(
  $$ select * from materiales_catalogo where empresa_id = 'c0000000-0000-0000-0000-00000000000c' $$,
  'Admin D no ve el catálogo de materiales de la Empresa C'
);

-- ============================================================================
-- Grupo E — Equipo: insertar catálogo es solo del Admin; marcar estado no
-- ============================================================================

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000002'); -- Supervisor C1

select throws_ok(
  $$ insert into equipos_catalogo (empresa_id, nombre) values ('c0000000-0000-0000-0000-00000000000c', 'Generador') $$,
  'new row violates row-level security policy for table "equipos_catalogo"',
  'Un Supervisor NO puede agregar equipo al catálogo'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000001'); -- Admin C

select lives_ok(
  $$ insert into equipos_catalogo (id, empresa_id, nombre) values ('c0000000-0000-0000-0000-0000000000a4', 'c0000000-0000-0000-0000-00000000000c', 'Generador 5000W') $$,
  'El Admin sí puede agregar equipo al catálogo'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000002'); -- Supervisor C1

select lives_ok(
  $$ update equipos_catalogo set estado = 'dañado' where id = 'c0000000-0000-0000-0000-0000000000a4' $$,
  'Un Supervisor SÍ puede marcar un equipo como dañado (aunque no pueda crearlo)'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000004'); -- Trabajador C1

-- Un UPDATE bloqueado por RLS no lanza excepción como sí lo hace un
-- INSERT rechazado — la política simplemente no encuentra la fila que
-- actualizar y el UPDATE "tiene éxito" afectando 0 filas, en silencio.
-- Por eso la prueba correcta es confirmar que el valor NO cambió, no
-- esperar un error.
update equipos_catalogo set estado = 'perdido' where id = 'c0000000-0000-0000-0000-0000000000a4';

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000001'); -- Admin C (para poder leer el resultado)

select is(
  (select estado::text from equipos_catalogo where id = 'c0000000-0000-0000-0000-0000000000a4'),
  'dañado',
  'Un trabajador NO puede cambiar el estado de un equipo (el UPDATE no encontró fila que tocar)'
);

-- ============================================================================
-- Grupo F — El trigger de aviso creó la notificación para el Admin
-- ============================================================================

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000001'); -- Admin C

select isnt_empty(
  $$ select * from notificaciones where usuario_id = 'c0000000-0000-0000-0000-000000000001' and tipo = 'equipo_danado' $$,
  'Marcar el equipo como dañado disparó el aviso automático al Admin'
);

-- ============================================================================
-- Grupo G — Equipo: aislamiento de asignaciones entre supervisores
-- ============================================================================

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000002'); -- Supervisor C1

select lives_ok(
  $$ insert into equipo_asignaciones (equipo_id, proyecto_id, entregado_por)
     values ('c0000000-0000-0000-0000-0000000000a4', 'c0000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-000000000002') $$,
  'Supervisor C1 puede asignar el equipo a SU proyecto'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000003'); -- Supervisor C2

select is_empty(
  $$ select * from equipo_asignaciones where proyecto_id = 'c0000000-0000-0000-0000-0000000000f1' $$,
  'Supervisor C2 NO ve la asignación de equipo del proyecto de Supervisor C1'
);

-- ============================================================================
-- Grupo H — Documentos: aislamiento entre supervisores + Admin ve todo
-- ============================================================================

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000002'); -- Supervisor C1

select lives_ok(
  $$ insert into documentos_proyecto (proyecto_id, nombre, storage_path, subido_por)
     values ('c0000000-0000-0000-0000-0000000000f1', 'permiso.pdf', 'c0000000-0000-0000-0000-0000000000f1/permiso.pdf', 'c0000000-0000-0000-0000-000000000002') $$,
  'Supervisor C1 puede subir un documento a SU proyecto'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000003'); -- Supervisor C2

select is_empty(
  $$ select * from documentos_proyecto where proyecto_id = 'c0000000-0000-0000-0000-0000000000f1' $$,
  'Supervisor C2 NO ve el documento del proyecto de Supervisor C1'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000001'); -- Admin C

select isnt_empty(
  $$ select * from documentos_proyecto where proyecto_id = 'c0000000-0000-0000-0000-0000000000f1' $$,
  'El Admin sí ve el documento, sin importar qué supervisor lo subió'
);

-- ============================================================================
-- Grupo I — es_comprador() distingue correctamente el rol
-- ============================================================================

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000005'); -- Comprador C1

select is(
  (select es_comprador()),
  true,
  'es_comprador() devuelve true para un usuario con rol comprador'
);

select pg_temp.autenticar_como('c0000000-0000-0000-0000-000000000004'); -- Trabajador C1

select is(
  (select es_comprador()),
  false,
  'es_comprador() devuelve false para un trabajador'
);

select pg_temp.salir_sesion();
select finish();
rollback;
