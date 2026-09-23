-- ============================================================================
-- OBRAPAY — Modelo de datos completo (Postgres / Supabase)
-- Arquitectura: multi-tenant compartido, aislado por empresa_id + Row Level
-- Security (RLS). Ver decisión de arquitectura en la conversación con Claude.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type rol_usuario as enum ('trabajador','supervisor','admin','owner');
create type estado_empresa as enum ('active','trial','suspended');
create type clave_plan as enum ('free','basic','pro','enterprise');
create type metodo_pago as enum ('transfer','cash','check','wallet');
create type estado_registro_horas as enum (
  'pendiente','aprobado_supervisor','aprobado_admin_tarde',
  'rechazado','cerrado_automatico'
);
create type estado_semana as enum ('abierta','cerrada','pagada');
create type estado_proyecto as enum ('activo','cerrado');
create type estado_prestamo as enum ('activo','pagado');
create type canal_notificacion as enum ('whatsapp','email','push');

-- ============================================================================
-- 1. EMPRESAS (tenants)
-- ============================================================================
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  industria text,
  direccion text,
  telefono text,
  rnc_id_fiscal text,
  logo_url text,
  estado estado_empresa not null default 'trial',
  creado_en timestamptz not null default now()
);

-- ============================================================================
-- 2. PLANES (catálogo global — lo administra el Creador SaaS)
-- ============================================================================
create table planes (
  id uuid primary key default gen_random_uuid(),
  clave clave_plan not null unique,
  nombre text not null,
  precio_mensual numeric(10,2) not null default 0,
  limite_trabajadores int,          -- null = ilimitado
  limite_proyectos int,             -- null = ilimitado
  historial_semanas int,            -- null = ilimitado
  activo boolean not null default true
);

-- ============================================================================
-- 3. SUSCRIPCIONES (plan activo de cada empresa)
-- ============================================================================
create table suscripciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  plan_id uuid not null references planes(id),
  facturacion text not null default 'monthly', -- monthly | annual
  fecha_inicio date not null default current_date,
  fecha_renovacion date not null,
  estado text not null default 'active',       -- active | canceled
  unique (empresa_id)  -- una suscripción activa por empresa
);

-- ============================================================================
-- 4. ADDONS (catálogo global de servicios extra)
-- ============================================================================
create table addons_catalogo (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,       -- ej. 'whatsapp', 'storage'
  nombre text not null,
  precio_mensual numeric(10,2) not null,
  activo boolean not null default true
);

create table empresa_addons (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  addon_id uuid not null references addons_catalogo(id),
  activo boolean not null default true,
  activado_en timestamptz not null default now(),
  unique (empresa_id, addon_id)
);

-- ============================================================================
-- 5. USUARIOS (identidad — 1:1 con auth.users de Supabase)
-- ============================================================================
create table usuarios (
  id uuid primary key,               -- = auth.users.id
  empresa_id uuid references empresas(id) on delete cascade, -- null solo para 'owner'
  nombre text not null,
  email text not null,
  rol rol_usuario not null default 'trabajador',
  idioma_preferido text not null default 'es', -- es | en | ht
  estado text not null default 'activo',       -- activo | inactivo
  creado_en timestamptz not null default now()
);
create index idx_usuarios_empresa on usuarios(empresa_id);

-- ============================================================================
-- 6. PERFIL_NOMINA (datos de pago — 1:1 con usuarios que cobran por hora)
-- ============================================================================
create table perfil_nomina (
  usuario_id uuid primary key references usuarios(id) on delete cascade,
  oficio text not null,
  tarifa_hora numeric(10,2) not null,
  porcentaje_seguro numeric(5,2) not null default 0,
  metodo_pago metodo_pago not null default 'transfer',
  cuenta_bancaria text,
  requiere_gps boolean not null default true
);

-- Historial de cambios de tarifa (dispara notificación al trabajador)
create table historial_tarifas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tarifa_anterior numeric(10,2) not null,
  tarifa_nueva numeric(10,2) not null,
  motivo text,
  fecha_cambio timestamptz not null default now()
);

-- ============================================================================
-- 7. PROYECTOS
-- ============================================================================
create table proyectos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  ubicacion text,
  supervisor_principal_id uuid references usuarios(id),
  presupuesto numeric(12,2),
  geo_cerca_activa boolean not null default false, -- feature Pro+
  geo_cerca_radio_m int default 250,
  estado estado_proyecto not null default 'activo',
  creado_en timestamptz not null default now()
);
create index idx_proyectos_empresa on proyectos(empresa_id);

-- Multi-supervisor por proyecto (feature Pro+)
create table proyecto_supervisores (
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  primary key (proyecto_id, usuario_id)
);

-- Asignación de trabajadores a proyectos (N:N — un trabajador puede
-- estar en varios proyectos en la misma semana)
create table proyecto_trabajadores (
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  asignado_en timestamptz not null default now(),
  primary key (proyecto_id, usuario_id)
);

-- ============================================================================
-- 8. SEMANAS_PAGO (ciclo de nómina: cierra miércoles, paga viernes)
-- ============================================================================
create table semanas_pago (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  fecha_inicio date not null,
  fecha_cierre timestamptz not null,   -- miércoles 11:59pm
  fecha_pago date not null,            -- viernes
  estado estado_semana not null default 'abierta'
);
create index idx_semanas_empresa on semanas_pago(empresa_id, fecha_inicio);

-- ============================================================================
-- 9. REGISTROS_HORAS (marcaje de entrada/salida)
-- ============================================================================
create table registros_horas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  semana_id uuid not null references semanas_pago(id),
  hora_entrada timestamptz not null,
  hora_salida timestamptz,             -- null = turno abierto
  ubicacion_entrada point,             -- lat/lng si geo-cerca activa
  ubicacion_salida point,
  horas_normales numeric(5,2) not null default 0,
  horas_extra numeric(5,2) not null default 0,  -- después de las 5:00pm
  estado estado_registro_horas not null default 'pendiente',
  aprobado_por uuid references usuarios(id),
  fecha_aprobacion timestamptz,
  -- true si el trabajador tenía otra entrada abierta al momento de esta:
  -- el sistema no debe permitirlo (regla de negocio validada en backend)
  creado_en timestamptz not null default now()
);
create index idx_horas_usuario_semana on registros_horas(usuario_id, semana_id);
create index idx_horas_proyecto on registros_horas(proyecto_id);

-- ============================================================================
-- 10. PRESTAMOS INTERNOS
-- ============================================================================
create table prestamos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  monto_total numeric(10,2) not null,
  saldo_pendiente numeric(10,2) not null,
  estado estado_prestamo not null default 'activo',
  otorgado_en timestamptz not null default now()
);

-- Descuento aplicado en una semana específica (monto variable, manual)
create table prestamo_descuentos (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null references prestamos(id) on delete cascade,
  semana_id uuid not null references semanas_pago(id),
  monto numeric(10,2) not null
);

-- ============================================================================
-- 11. PAGOS_SEMANALES (el reporte/nómina calculada)
-- ============================================================================
create table pagos_semanales (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  semana_id uuid not null references semanas_pago(id),
  horas_normales numeric(6,2) not null default 0,
  horas_extra numeric(6,2) not null default 0,
  bruto numeric(10,2) not null default 0,
  descuento_seguro numeric(10,2) not null default 0,
  descuento_prestamo numeric(10,2) not null default 0,
  neto numeric(10,2) not null default 0,
  firma_digital_en timestamptz,        -- feature Pro+; null = no firmado
  estado text not null default 'pendiente', -- pendiente | pagado
  unique (usuario_id, semana_id)
);

-- Desglose de horas por proyecto dentro de un pago semanal
-- (necesario para "costo de mano de obra por proyecto")
create table pago_proyecto_detalle (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references pagos_semanales(id) on delete cascade,
  proyecto_id uuid not null references proyectos(id),
  horas numeric(6,2) not null default 0,
  costo numeric(10,2) not null default 0
);

-- ============================================================================
-- 12. NOTIFICACIONES
-- ============================================================================
create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tipo text not null,                  -- cambio_tarifa | cierre_semana | horas_pendientes | prestamo
  canal canal_notificacion not null,
  mensaje text not null,
  leido boolean not null default false,
  creado_en timestamptz not null default now()
);

-- ============================================================================
-- 13. AUDITORIA (feature Empresarial — bitácora exportable)
-- ============================================================================
create table auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  accion text not null,                -- ej. 'aprobo_horas', 'cambio_tarifa'
  entidad text not null,               -- ej. 'registros_horas'
  entidad_id uuid,
  detalle jsonb,
  creado_en timestamptz not null default now()
);

-- ============================================================================
-- 14. CATALOGO_OFICIOS (global, lo administra el Creador SaaS)
-- ============================================================================
create table catalogo_oficios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

-- ============================================================================
-- 15. CONFIGURACION (por empresa y global del sistema)
-- ============================================================================
create table configuracion_empresa (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  dia_cierre text not null default 'Miércoles',
  hora_cierre time not null default '23:59',
  hora_inicio_extra time not null default '17:00',
  seguro_default_pct numeric(5,2) not null default 5,
  idioma_default text not null default 'es',
  requiere_gps_default boolean not null default true,
  firma_digital_activa boolean not null default false, -- requiere plan Pro+
  canal_whatsapp boolean not null default true,
  canal_email boolean not null default true,
  canal_push boolean not null default true
);

create table configuracion_sistema (
  id boolean primary key default true,  -- fila única (singleton)
  permitir_registro_empresas boolean not null default true,
  modo_mantenimiento boolean not null default false,
  umbral_extra_default time not null default '17:00',
  check (id)
);

-- ============================================================================
-- ROW LEVEL SECURITY — aislamiento por empresa
-- ============================================================================

-- Función auxiliar: empresa del usuario autenticado
create or replace function empresa_actual()
returns uuid
language sql stable
as $$
  select empresa_id from usuarios where id = auth.uid()
$$;

-- Función auxiliar: ¿el usuario autenticado es el Creador SaaS?
create or replace function es_owner()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from usuarios where id = auth.uid() and rol = 'owner'
  )
$$;

alter table empresas enable row level security;
alter table usuarios enable row level security;
alter table perfil_nomina enable row level security;
alter table proyectos enable row level security;
alter table proyecto_trabajadores enable row level security;
alter table proyecto_supervisores enable row level security;
alter table registros_horas enable row level security;
alter table prestamos enable row level security;
alter table pagos_semanales enable row level security;
alter table notificaciones enable row level security;
alter table auditoria enable row level security;
alter table configuracion_empresa enable row level security;
alter table semanas_pago enable row level security;

-- Patrón general: el owner ve todo; el resto solo su propia empresa.
create policy empresas_acceso on empresas
  for select using (es_owner() or id = empresa_actual());

create policy usuarios_acceso on usuarios
  for select using (es_owner() or empresa_id = empresa_actual());

create policy proyectos_acceso on proyectos
  for all using (es_owner() or empresa_id = empresa_actual());

create policy registros_horas_acceso on registros_horas
  for all using (
    es_owner() or
    usuario_id = auth.uid() or                         -- el propio trabajador
    usuario_id in (select id from usuarios where empresa_id = empresa_actual())
  );

create policy pagos_acceso on pagos_semanales
  for select using (
    es_owner() or
    usuario_id = auth.uid() or
    usuario_id in (select id from usuarios where empresa_id = empresa_actual())
  );

create policy notificaciones_acceso on notificaciones
  for select using (usuario_id = auth.uid());

-- (Repetir el mismo patrón empresa_id = empresa_actual() en el resto de
-- tablas con empresa_id: prestamos vía usuario_id, semanas_pago, auditoria,
-- configuracion_empresa, proyecto_trabajadores, proyecto_supervisores.)

-- ============================================================================
-- SEMILLA MÍNIMA — catálogo de planes
-- ============================================================================
insert into planes (clave, nombre, precio_mensual, limite_trabajadores, limite_proyectos, historial_semanas) values
  ('free',       'Gratuito',     0,   20,   5,    8),
  ('basic',      'Básico',       29,  null, null, null),
  ('pro',        'Profesional',  79,  null, null, null),
  ('enterprise', 'Empresarial',  199, null, null, null);

insert into addons_catalogo (clave, nombre, precio_mensual) values
  ('whatsapp', 'Recibos de pago por WhatsApp', 10),
  ('storage',  'Almacenamiento extendido',      8);
