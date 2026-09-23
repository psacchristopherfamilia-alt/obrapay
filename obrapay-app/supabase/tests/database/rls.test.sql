-- ============================================================================
-- Pruebas de RLS con pgTAP
--
-- Cómo correrlas:
--   supabase test db
-- (requiere la extensión pgtap — Database → Extensions en Supabase, o
--  `create extension pgtap;` en local)
--
-- Cada assert simula ser un usuario distinto cambiando el JWT de la sesión
-- (auth.uid() lee de ahí) — no hace falta crear cuentas reales en
-- Supabase Auth para probar las políticas, porque usuarios.id no tiene una
-- foreign key hacia auth.users.
-- ============================================================================

begin;
select plan(15);

-- ---- Helper: cambia de "usuario autenticado" dentro del mismo test ---------
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

-- ---- Fixtures: dos empresas, roles variados ---------------------------------
insert into empresas (id, nombre, estado) values
  ('a0000000-0000-0000-0000-00000000000a', 'Empresa A', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'Empresa B', 'active');

insert into usuarios (id, empresa_id, nombre, email, rol) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Admin A', 'admina@test.com', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Trabajador A1', 'a1@test.com', 'trabajador'),
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Trabajador A2', 'a2@test.com', 'trabajador'),
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'Supervisor A1', 'supa1@test.com', 'supervisor'),
  ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000a', 'Supervisor A2', 'supa2@test.com', 'supervisor'),
  ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Admin B', 'adminb@test.com', 'admin'),
  ('00000000-0000-0000-0000-0000000000ee', null, 'Owner', 'owner@test.com', 'owner');

insert into perfil_nomina (usuario_id, oficio, tarifa_hora, porcentaje_seguro, metodo_pago) values
  ('a0000000-0000-0000-0000-000000000002', 'Albañil', 10, 5, 'cash'),
  ('a0000000-0000-0000-0000-000000000003', 'Electricista', 12, 5, 'cash');

insert into proyectos (id, empresa_id, nombre, supervisor_principal_id, presupuesto) values
  ('a0000000-0000-0000-0000-0000000000p1', 'a0000000-0000-0000-0000-00000000000a', 'Proyecto A1', 'a0000000-0000-0000-0000-000000000004', 5000),
  ('a0000000-0000-0000-0000-0000000000p2', 'a0000000-0000-0000-0000-00000000000a', 'Proyecto A2', 'a0000000-0000-0000-0000-000000000005', 5000);

insert into proyecto_trabajadores (proyecto_id, usuario_id) values
  ('a0000000-0000-0000-0000-0000000000p1', 'a0000000-0000-0000-0000-000000000002');

insert into semanas_pago (id, empresa_id, fecha_inicio, fecha_cierre, fecha_pago, estado) values
  ('a0000000-0000-0000-0000-0000000000s1', 'a0000000-0000-0000-0000-00000000000a', current_date, now() + interval '2 days', current_date + 4, 'abierta');

insert into registros_horas (id, usuario_id, proyecto_id, semana_id, hora_entrada, hora_salida, horas_normales, estado) values
  ('a0000000-0000-0000-0000-0000000000r1', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000p1', 'a0000000-0000-0000-0000-0000000000s1', now(), now() + interval '8 hours', 8, 'pendiente'),
  ('a0000000-0000-0000-0000-0000000000r2', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000p2', 'a0000000-0000-0000-0000-0000000000s1', now(), now() + interval '8 hours', 8, 'pendiente');

insert into pagos_semanales (id, usuario_id, semana_id, horas_normales, bruto, descuento_seguro, descuento_prestamo, neto, estado) values
  ('a0000000-0000-0000-0000-0000000000g1', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000s1', 8, 80, 4, 0, 76, 'pagado');

-- ============================================================================
-- Grupo 1 — Regresión del bug de recursión infinita (Corte 9, hallazgo #2)
-- Antes del fix, CUALQUIERA de estas consultas tiraba
-- "infinite recursion detected in policy for relation usuarios".
-- ============================================================================

select pg_temp.autenticar_como('a0000000-0000-0000-0000-000000000002'); -- Trabajador A1

select lives_ok(
  $$ select * from usuarios where id = auth.uid() $$,
  'Un trabajador puede leer su propia fila en usuarios sin recursión infinita'
);

select lives_ok(
  $$ select empresa_actual() $$,
  'empresa_actual() no se muerde la cola a sí misma'
);

select lives_ok(
  $$ select es_admin() $$,
  'es_admin() no se muerde la cola a sí misma'
);

select lives_ok(
  $$ select * from configuracion_empresa where empresa_id = empresa_actual() $$,
  'configuracion_empresa es legible por un trabajador (la necesita para marcar horas)'
);

select lives_ok(
  $$ select * from semanas_pago where empresa_id = empresa_actual() $$,
  'semanas_pago es legible por un trabajador (la necesita para marcar horas)'
);

-- ============================================================================
-- Grupo 2 — Regresión de las 7 tablas que tenían RLS activado sin política
-- (Corte 9, hallazgo #1): antes de la migración 010, estas consultas
-- devolvían siempre 0 filas para todo el mundo, incluso el dueño legítimo.
-- (sigue autenticado como Trabajador A1)
-- ============================================================================

select isnt_empty(
  $$ select * from perfil_nomina where usuario_id = auth.uid() $$,
  'Un trabajador puede leer su propio perfil_nomina'
);

select isnt_empty(
  $$ select * from proyecto_trabajadores where usuario_id = auth.uid() $$,
  'Un trabajador puede leer sus propias asignaciones en proyecto_trabajadores'
);

-- ============================================================================
-- Grupo 3 — Aislamiento entre trabajadores de la MISMA empresa
-- Un compañero no debe poder ver el pago ni el préstamo de otro.
-- ============================================================================

select pg_temp.autenticar_como('a0000000-0000-0000-0000-000000000003'); -- Trabajador A2

select is_empty(
  $$ select * from pagos_semanales where usuario_id = 'a0000000-0000-0000-0000-000000000002' $$,
  'Trabajador A2 no puede ver el pago de Trabajador A1'
);

-- ============================================================================
-- Grupo 4 — Aislamiento entre SUPERVISORES del mismo proyecto/empresa
-- Supervisor A2 no debe poder aprobar/ver horas del proyecto de Supervisor A1.
-- ============================================================================

select pg_temp.autenticar_como('a0000000-0000-0000-0000-000000000005'); -- Supervisor A2

select is_empty(
  $$ select * from registros_horas where id = 'a0000000-0000-0000-0000-0000000000r1' $$,
  'Supervisor A2 no ve las horas del proyecto de Supervisor A1'
);

select isnt_empty(
  $$ select * from registros_horas where id = 'a0000000-0000-0000-0000-0000000000r2' $$,
  'Supervisor A2 sí ve las horas de SU propio proyecto'
);

-- ============================================================================
-- Grupo 5 — Aislamiento entre EMPRESAS (multi-tenant)
-- ============================================================================

select pg_temp.autenticar_como('b0000000-0000-0000-0000-000000000001'); -- Admin B

select is_empty(
  $$ select * from proyectos where empresa_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  'Admin B no ve los proyectos de la Empresa A'
);

select is_empty(
  $$ select * from usuarios where empresa_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  'Admin B no ve a los usuarios de la Empresa A'
);

update empresas set estado = 'suspended' where id = 'a0000000-0000-0000-0000-00000000000a';
select is(
  (select estado from empresas where id = 'a0000000-0000-0000-0000-00000000000a'),
  'active',
  'Admin B no puede cambiar el estado de la Empresa A'
);

-- ============================================================================
-- Grupo 6 — El Owner sí ve todo
-- ============================================================================

select pg_temp.autenticar_como('00000000-0000-0000-0000-0000000000ee'); -- Owner

select is(
  (select count(*)::int from empresas where id in (
    'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b'
  )),
  2,
  'El owner ve empresas de ambos tenants'
);

select isnt_empty(
  $$ select * from pagos_semanales where usuario_id = 'a0000000-0000-0000-0000-000000000002' $$,
  'El owner puede leer el pago de cualquier trabajador de cualquier empresa'
);

select pg_temp.salir_sesion();
select finish();
rollback;
