-- ============================================================================
-- 027 — Facturación a clientes: cotizaciones y facturas
-- Tercer módulo de la ronda de "funciones para mi padre". Distinto a
-- todo lo anterior: es dinero que ENTRA (de clientes externos), no que
-- sale (a trabajadores) — por eso el acceso queda mucho más cerrado
-- (solo Admin y Owner, ni Supervisor ni Comprador lo tocan).
-- ============================================================================

create type estado_cotizacion as enum ('borrador', 'enviada', 'aceptada', 'rechazada');
create type estado_factura as enum ('pendiente', 'pagada', 'vencida', 'anulada');

create table clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  contacto text,
  telefono text,
  email text,
  direccion text,
  creado_en timestamptz not null default now()
);
create index idx_clientes_empresa on clientes(empresa_id);

create table cotizaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  proyecto_id uuid references proyectos(id),
  numero int not null,
  fecha date not null default current_date,
  valida_hasta date,
  estado estado_cotizacion not null default 'borrador',
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notas text,
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index idx_cotizaciones_empresa on cotizaciones(empresa_id);

create table cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  descripcion text not null,
  cantidad numeric(10,2) not null default 1,
  precio_unitario numeric(10,2) not null,
  orden int not null default 0
);

create table facturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  proyecto_id uuid references proyectos(id),
  cotizacion_id uuid references cotizaciones(id),
  numero int not null,
  fecha_emision date not null default current_date,
  fecha_vencimiento date,
  estado estado_factura not null default 'pendiente',
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  fecha_pago date,
  notas text,
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index idx_facturas_empresa on facturas(empresa_id);

create table factura_items (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas(id) on delete cascade,
  descripcion text not null,
  cantidad numeric(10,2) not null default 1,
  precio_unitario numeric(10,2) not null,
  orden int not null default 0
);

alter table clientes enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_items enable row level security;
alter table facturas enable row level security;
alter table factura_items enable row level security;

-- Solo Admin y Owner — ni Supervisor ni Comprador tocan esto. Distinto a
-- Materiales/Equipo/Vehículos a propósito: esto es dinero que entra de
-- clientes, no operación de obra del día a día.

create policy clientes_acceso on clientes
  for all using (es_owner() or (es_admin() and empresa_id = empresa_actual()))
  with check (es_owner() or (es_admin() and empresa_id = empresa_actual()));

create policy cotizaciones_acceso on cotizaciones
  for all using (es_owner() or (es_admin() and empresa_id = empresa_actual()))
  with check (es_owner() or (es_admin() and empresa_id = empresa_actual()));

create policy cotizacion_items_acceso on cotizacion_items
  for all using (
    es_owner()
    or exists (select 1 from cotizaciones c where c.id = cotizacion_items.cotizacion_id and es_admin() and c.empresa_id = empresa_actual())
  )
  with check (
    es_owner()
    or exists (select 1 from cotizaciones c where c.id = cotizacion_items.cotizacion_id and es_admin() and c.empresa_id = empresa_actual())
  );

create policy facturas_acceso on facturas
  for all using (es_owner() or (es_admin() and empresa_id = empresa_actual()))
  with check (es_owner() or (es_admin() and empresa_id = empresa_actual()));

create policy factura_items_acceso on factura_items
  for all using (
    es_owner()
    or exists (select 1 from facturas f where f.id = factura_items.factura_id and es_admin() and f.empresa_id = empresa_actual())
  )
  with check (
    es_owner()
    or exists (select 1 from facturas f where f.id = factura_items.factura_id and es_admin() and f.empresa_id = empresa_actual())
  );
