-- ============================================================================
-- 004 — Completar RLS: piezas que faltaban para el Creador SaaS
-- ============================================================================

-- empresas: el admin actualiza la suya (perfil de empresa), el owner
-- cualquiera (suspender/activar). Antes solo existía política de SELECT.
create policy empresas_update on empresas
  for update using (es_owner() or id = empresa_actual());

-- suscripciones: cada empresa ve la suya, el owner ve todas. La escritura
-- queda reservada al owner y al service role (Stripe checkout/webhook usan
-- supabaseAdmin(), que se salta RLS) — un Admin nunca escribe esta tabla
-- directo, siempre pasa por Stripe Checkout.
alter table suscripciones enable row level security;
create policy suscripciones_select on suscripciones
  for select using (es_owner() or empresa_id = empresa_actual());
create policy suscripciones_write on suscripciones
  for all using (es_owner()) with check (es_owner());

-- planes y addons_catalogo: catálogo público de lectura (cualquier usuario
-- autenticado necesita verlos para elegir plan), solo el owner los edita.
alter table planes enable row level security;
create policy planes_select on planes for select using (true);
create policy planes_write on planes for all using (es_owner()) with check (es_owner());

alter table addons_catalogo enable row level security;
create policy addons_catalogo_select on addons_catalogo for select using (true);
create policy addons_catalogo_write on addons_catalogo for all using (es_owner()) with check (es_owner());

-- empresa_addons: cada empresa administra los suyos, el owner ve todos.
alter table empresa_addons enable row level security;
create policy empresa_addons_acceso on empresa_addons
  for all using (es_owner() or empresa_id = empresa_actual())
  with check (es_owner() or empresa_id = empresa_actual());

-- catalogo_oficios: lectura pública (lo usa el formulario de alta de
-- trabajador en cualquier empresa), solo el owner lo administra.
alter table catalogo_oficios enable row level security;
create policy catalogo_oficios_select on catalogo_oficios for select using (true);
create policy catalogo_oficios_write on catalogo_oficios for all using (es_owner()) with check (es_owner());

-- configuracion_sistema: exclusivo del owner.
alter table configuracion_sistema enable row level security;
create policy configuracion_sistema_acceso on configuracion_sistema
  for all using (es_owner()) with check (es_owner());

-- Semilla del catálogo de oficios (antes vivía hardcodeado en el frontend)
insert into catalogo_oficios (nombre) values
  ('Operador de maquinaria'), ('Albañil'), ('Electricista'), ('Plomero'),
  ('Ayudante general'), ('Carpintero'), ('Soldador'), ('Pintor')
on conflict (nombre) do nothing;
