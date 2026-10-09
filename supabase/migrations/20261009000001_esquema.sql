-- ObraPay · Esquema base
-- Todas las tablas llevan empresa_id para poder volverse multiempresa sin rehacer nada.
-- Las horas se guardan en UTC (timestamptz); la zona horaria vive en la empresa.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Empresa y reglas configurables
-- ---------------------------------------------------------------------------
create table public.empresas (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  zona_horaria        text not null default 'America/Grand_Turk',
  gps_activo          boolean not null default false,
  gps_modo            text not null default 'marcar' check (gps_modo in ('bloquear', 'marcar')),
  hora_extra_desde    time not null default '17:00',
  hora_cierre_turno   time not null default '23:00',
  -- Almuerzo fijo: se descuenta una vez por día trabajado, de las horas regulares.
  almuerzo_min        integer not null default 30 check (almuerzo_min between 0 and 240),
  almuerzo_desde_min  integer not null default 360 check (almuerzo_desde_min >= 0),
  creado_en           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------
create table public.perfiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  empresa_id          uuid not null references public.empresas (id),
  usuario             text not null,
  nombre              text not null,
  oficio              text,
  roles               text[] not null default array['trabajador'],
  idioma              text not null default 'es' check (idioma in ('es', 'en', 'ht')),
  activo              boolean not null default true,
  debe_cambiar_clave  boolean not null default true,
  creado_en           timestamptz not null default now(),
  unique (empresa_id, usuario),
  check (cardinality(roles) > 0),
  check (roles <@ array['trabajador', 'supervisor', 'admin', 'dueno'])
);

create table public.tarifas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id),
  perfil_id       uuid not null references public.perfiles (id) on delete cascade,
  monto_hora      numeric(10, 2) not null check (monto_hora > 0),
  vigente_desde   date not null,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  unique (perfil_id, vigente_desde)
);

create table public.seguros (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id),
  perfil_id       uuid not null references public.perfiles (id) on delete cascade,
  porcentaje      numeric(5, 2) not null check (porcentaje between 0 and 100),
  vigente_desde   date not null,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  unique (perfil_id, vigente_desde)
);

-- ---------------------------------------------------------------------------
-- Proyectos y asignaciones
-- ---------------------------------------------------------------------------
create table public.proyectos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id),
  nombre      text not null,
  direccion   text,
  lat         double precision,
  lng         double precision,
  radio_m     integer not null default 150 check (radio_m > 0),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table public.proyecto_supervisores (
  empresa_id   uuid not null references public.empresas (id),
  proyecto_id  uuid not null references public.proyectos (id) on delete cascade,
  perfil_id    uuid not null references public.perfiles (id) on delete cascade,
  primary key (proyecto_id, perfil_id)
);

create table public.proyecto_trabajadores (
  empresa_id   uuid not null references public.empresas (id),
  proyecto_id  uuid not null references public.proyectos (id) on delete cascade,
  perfil_id    uuid not null references public.perfiles (id) on delete cascade,
  primary key (proyecto_id, perfil_id)
);

-- ---------------------------------------------------------------------------
-- Semanas de pago: jueves a miércoles 11:59 p.m., pago el viernes
-- ---------------------------------------------------------------------------
create table public.semanas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id),
  inicio      date not null check (extract(isodow from inicio) = 4),
  fin         date not null,
  estado      text not null default 'abierta' check (estado in ('abierta', 'cerrada', 'pagada')),
  -- Reabierta por el admin: el cierre automático la respeta hasta que el admin la vuelva a cerrar.
  reabierta   boolean not null default false,
  cerrada_en  timestamptz,
  pagada_en   timestamptz,
  unique (empresa_id, inicio),
  check (fin = inicio + 6)
);

-- ---------------------------------------------------------------------------
-- Turnos (reloj) y su auditoría
-- ---------------------------------------------------------------------------
create table public.turnos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas (id),
  perfil_id           uuid not null references public.perfiles (id),
  proyecto_id         uuid not null references public.proyectos (id),
  entrada             timestamptz not null,
  salida              timestamptz,
  entrada_lat         double precision,
  entrada_lng         double precision,
  salida_lat          double precision,
  salida_lng          double precision,
  fuera_de_area       boolean not null default false,
  cierre_automatico   boolean not null default false,
  corregido           boolean not null default false,
  estado              text not null default 'abierto'
                        check (estado in ('abierto', 'por_aprobar', 'aprobado', 'aprobado_admin')),
  aprobado_por        uuid references public.perfiles (id),
  aprobado_en         timestamptz,
  -- Se asigna al cerrar la semana en la que entró a la nómina.
  semana_id           uuid references public.semanas (id),
  creado_en           timestamptz not null default now(),
  check (salida is null or salida > entrada),
  check ((estado = 'abierto') = (salida is null))
);

-- Un trabajador no puede tener dos turnos abiertos.
create unique index turnos_un_abierto_por_persona on public.turnos (perfil_id) where salida is null;
create index turnos_perfil_entrada on public.turnos (perfil_id, entrada);
create index turnos_proyecto_entrada on public.turnos (proyecto_id, entrada);
create index turnos_semana on public.turnos (semana_id);

create table public.turno_cambios (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id),
  turno_id    uuid not null references public.turnos (id) on delete cascade,
  campo       text not null,
  antes       text,
  despues     text,
  motivo      text not null check (length(trim(motivo)) > 0),
  por         uuid references public.perfiles (id),
  creado_en   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Préstamos internos (los maneja el admin)
-- ---------------------------------------------------------------------------
create table public.prestamos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id),
  perfil_id    uuid not null references public.perfiles (id),
  monto_total  numeric(10, 2) not null check (monto_total > 0),
  fecha        date not null default current_date,
  nota         text,
  activo       boolean not null default true,
  creado_por   uuid references public.perfiles (id),
  creado_en    timestamptz not null default now()
);

-- Lo que el admin decide descontar de cada préstamo en cada semana.
create table public.descuentos_prestamo (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id),
  prestamo_id  uuid not null references public.prestamos (id) on delete cascade,
  semana_id    uuid not null references public.semanas (id),
  monto        numeric(10, 2) not null check (monto >= 0),
  creado_por   uuid references public.perfiles (id),
  creado_en    timestamptz not null default now(),
  unique (prestamo_id, semana_id)
);

-- ---------------------------------------------------------------------------
-- Nómina congelada al cerrar la semana
-- ---------------------------------------------------------------------------
create table public.nomina_semanal (
  semana_id            uuid not null references public.semanas (id) on delete cascade,
  empresa_id           uuid not null references public.empresas (id),
  perfil_id            uuid not null references public.perfiles (id),
  minutos_reg          integer not null,
  minutos_extra        integer not null,
  bruto                numeric(10, 2) not null,
  seguro_pct           numeric(5, 2) not null,
  seguro               numeric(10, 2) not null,
  prestamo             numeric(10, 2) not null,
  neto                 numeric(10, 2) not null,
  con_aprobacion_admin boolean not null,
  primary key (semana_id, perfil_id)
);

create table public.nomina_proyecto (
  semana_id      uuid not null references public.semanas (id) on delete cascade,
  empresa_id     uuid not null references public.empresas (id),
  perfil_id      uuid not null references public.perfiles (id),
  proyecto_id    uuid not null references public.proyectos (id),
  minutos_reg    integer not null,
  minutos_extra  integer not null,
  bruto          numeric(10, 2) not null,
  primary key (semana_id, perfil_id, proyecto_id)
);

-- ---------------------------------------------------------------------------
-- Avisos y bitácora del admin
-- ---------------------------------------------------------------------------
create table public.notificaciones (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id),
  perfil_id   uuid not null references public.perfiles (id) on delete cascade,
  tipo        text not null,
  datos       jsonb not null default '{}'::jsonb,
  leida       boolean not null default false,
  creado_en   timestamptz not null default now()
);

create table public.eventos_admin (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id),
  tipo        text not null,
  detalle     jsonb not null default '{}'::jsonb,
  por         uuid references public.perfiles (id),
  creado_en   timestamptz not null default now()
);
