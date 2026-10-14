-- ============================================================================
-- 019 — Materiales: catálogo por empresa + compras por proyecto
-- Hasta ahora el costo de un proyecto solo contaba mano de obra
-- (costoPorProyecto). En una constructora real, materiales suele pesar
-- tanto o más que la nómina — sin esto, "presupuesto vs. gastado" está
-- incompleto aunque el número se vea razonable.
-- ============================================================================

create table materiales_catalogo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  unidad text not null,
  costo_referencial numeric(10,2),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index idx_materiales_empresa on materiales_catalogo(empresa_id);

create table compras_materiales (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  material_id uuid not null references materiales_catalogo(id),
  cantidad numeric(10,2) not null,
  costo_total numeric(10,2) not null,
  proveedor text,
  registrado_por uuid references usuarios(id),
  comprado_en timestamptz not null default now()
);
create index idx_compras_proyecto on compras_materiales(proyecto_id);

alter table materiales_catalogo enable row level security;

create policy materiales_catalogo_select on materiales_catalogo
  for select using (es_owner() or empresa_id = empresa_actual());

create policy materiales_catalogo_write on materiales_catalogo
  for all using (es_admin() and empresa_id = empresa_actual())
  with check (es_admin() and empresa_id = empresa_actual());

alter table compras_materiales enable row level security;

-- Select: admin de la empresa, o supervisor a cargo del proyecto (para ver
-- lo que él mismo y otros registraron ahí).
create policy compras_materiales_select on compras_materiales
  for select using (
    es_owner()
    or proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

-- Insert: admin O supervisor a cargo — el supervisor es quien suele estar
-- físicamente en la obra cuando llega el material.
create policy compras_materiales_insert on compras_materiales
  for insert with check (
    proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

-- Update/delete: solo admin — corregir un registro ya hecho no es cosa del
-- supervisor que lo cargó.
create policy compras_materiales_update on compras_materiales
  for update using (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  with check (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()));

create policy compras_materiales_delete on compras_materiales
  for delete using (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()));
