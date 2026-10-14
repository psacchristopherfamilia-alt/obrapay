-- ============================================================================
-- 022 — Separar "comprar" de "entregar": rediseño de Materiales
-- El Corte 24 asumía que comprar y entregar en la obra son el mismo
-- momento, atado directo a un proyecto. En la compañía real del usuario,
-- a veces se sabe el proyecto al comprar y a veces se compra primero y se
-- reparte después (incluso entre varios proyectos) — así que una compra
-- ya no tiene proyecto_id fijo; se reparte a través de entregas_materiales,
-- una o varias, completas o parciales.
-- ============================================================================

-- compras_materiales pasa de ser "por proyecto" a ser "por empresa"
drop policy if exists compras_materiales_select on compras_materiales;
drop policy if exists compras_materiales_insert on compras_materiales;
drop policy if exists compras_materiales_update on compras_materiales;
drop policy if exists compras_materiales_delete on compras_materiales;

alter table compras_materiales add column if not exists empresa_id uuid references empresas(id);

-- Backfill por si ya había compras del diseño anterior (proyecto_id nunca
-- fue null hasta ahora, así que esto cubre cualquier fila existente).
update compras_materiales cm
  set empresa_id = p.empresa_id
  from proyectos p
  where cm.proyecto_id = p.id and cm.empresa_id is null;

alter table compras_materiales alter column empresa_id set not null;
alter table compras_materiales alter column proyecto_id drop not null;

create or replace function es_comprador()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios where id = auth.uid() and rol = 'comprador' and empresa_id = empresa_actual()
  )
$$;
revoke execute on function es_comprador() from public, anon;
grant execute on function es_comprador() to authenticated;

create policy compras_materiales_select on compras_materiales
  for select using (
    es_owner()
    or (empresa_id = empresa_actual() and auth.uid() in (
      select id from usuarios where empresa_id = empresa_actual() and rol in ('admin', 'supervisor', 'comprador')
    ))
  );

create policy compras_materiales_insert on compras_materiales
  for insert with check (
    empresa_id = empresa_actual()
    and auth.uid() in (
      select id from usuarios where empresa_id = empresa_actual() and rol in ('admin', 'supervisor', 'comprador')
    )
  );

create policy compras_materiales_update on compras_materiales
  for update using (es_admin() and empresa_id = empresa_actual())
  with check (es_admin() and empresa_id = empresa_actual());

create policy compras_materiales_delete on compras_materiales
  for delete using (es_admin() and empresa_id = empresa_actual());

-- ----------------------------------------------------------------------------
-- entregas_materiales — el reparto de una compra a uno o más proyectos
-- ----------------------------------------------------------------------------
create table entregas_materiales (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras_materiales(id) on delete cascade,
  proyecto_id uuid not null references proyectos(id),
  cantidad numeric(10,2) not null,
  costo_asignado numeric(10,2) not null,
  entregado_por uuid references usuarios(id),
  entregado_en timestamptz not null default now()
);
create index idx_entregas_proyecto on entregas_materiales(proyecto_id);
create index idx_entregas_compra on entregas_materiales(compra_id);

alter table entregas_materiales enable row level security;

create policy entregas_materiales_select on entregas_materiales
  for select using (
    es_owner()
    or proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
    or exists (
      select 1 from compras_materiales c
      where c.id = entregas_materiales.compra_id and es_comprador() and c.empresa_id = empresa_actual()
    )
  );

create policy entregas_materiales_insert on entregas_materiales
  for insert with check (
    proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
    or (es_comprador() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

create policy entregas_materiales_delete on entregas_materiales
  for delete using (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()));
