-- ============================================================================
-- 023 — Herramientas/equipo compartido entre proyectos
-- Surgió de preguntarle al usuario qué más le duele fuera de horas y
-- materiales: "se pierden o dañan seguido". Mismo patrón de RLS que
-- Materiales (Admin y Supervisor a cargo pueden mover equipo entre
-- proyectos), más un aviso automático — real, no solo visual — cuando algo
-- se marca dañado o perdido.
-- ============================================================================

create type estado_equipo as enum ('activo', 'dañado', 'perdido', 'en_reparacion', 'de_baja');
create type condicion_equipo as enum ('buena', 'regular', 'dañada');

create table equipos_catalogo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  tipo text,
  numero_serie text,
  estado estado_equipo not null default 'activo',
  valor_reemplazo numeric(10,2),
  creado_en timestamptz not null default now()
);
create index idx_equipos_empresa on equipos_catalogo(empresa_id);

create table equipo_asignaciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos_catalogo(id) on delete cascade,
  proyecto_id uuid not null references proyectos(id),
  condicion_entrega condicion_equipo not null default 'buena',
  nota_entrega text,
  entregado_por uuid references usuarios(id),
  entregado_en timestamptz not null default now(),
  condicion_devolucion condicion_equipo,
  nota_devolucion text,
  recibido_por uuid references usuarios(id),
  devuelto_en timestamptz
);
create index idx_equipo_asignaciones_equipo on equipo_asignaciones(equipo_id);
create index idx_equipo_asignaciones_proyecto on equipo_asignaciones(proyecto_id);

alter table equipos_catalogo enable row level security;

create policy equipos_catalogo_select on equipos_catalogo
  for select using (es_owner() or empresa_id = empresa_actual());

create policy equipos_catalogo_insert on equipos_catalogo
  for insert with check (es_admin() and empresa_id = empresa_actual());

-- Update es más permisivo que insert/delete a propósito: tanto Admin como
-- cualquier Supervisor de la empresa pueden marcar un equipo como dañado o
-- perdido (es quien está en la obra cuando pasa) — no se restringió a
-- "solo el equipo que ese supervisor tiene asignado" para no complicar la
-- regla; es una simplificación consciente, documentada en el README.
create policy equipos_catalogo_update on equipos_catalogo
  for update using (
    es_admin()
    or (empresa_id = empresa_actual() and auth.uid() in (
      select id from usuarios where empresa_id = empresa_actual() and rol = 'supervisor'
    ))
  )
  with check (
    es_admin()
    or (empresa_id = empresa_actual() and auth.uid() in (
      select id from usuarios where empresa_id = empresa_actual() and rol = 'supervisor'
    ))
  );

create policy equipos_catalogo_delete on equipos_catalogo
  for delete using (es_admin() and empresa_id = empresa_actual());

alter table equipo_asignaciones enable row level security;

create policy equipo_asignaciones_select on equipo_asignaciones
  for select using (
    es_owner()
    or proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

create policy equipo_asignaciones_insert on equipo_asignaciones
  for insert with check (
    proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

-- El update cubre "registrar la devolución" (llenar condicion_devolucion,
-- devuelto_en, recibido_por) — mismo alcance que insert.
create policy equipo_asignaciones_update on equipo_asignaciones
  for update using (
    proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  )
  with check (
    proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

-- ----------------------------------------------------------------------------
-- Aviso automático al Admin cuando un equipo se marca dañado o perdido.
-- Es un trigger (no un Server Action) para que dispare sin importar desde
-- qué pantalla se haga el cambio — el catálogo del Admin o la devolución
-- de un Supervisor actualizan la misma columna.
-- ----------------------------------------------------------------------------
create or replace function avisar_equipo_danado_perdido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
  v_mensaje text;
begin
  if NEW.estado not in ('dañado', 'perdido') or OLD.estado is not distinct from NEW.estado then
    return NEW;
  end if;

  v_mensaje := 'El equipo "' || NEW.nombre || '" se marcó como ' || NEW.estado || '.';

  for admin_row in
    select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
           coalesce(ce.canal_email, true) as canal_email,
           coalesce(ce.canal_push, true) as canal_push
    from usuarios u
    left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
    where u.empresa_id = NEW.empresa_id and u.rol = 'admin'
  loop
    if admin_row.canal_whatsapp then
      insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'equipo_danado', 'whatsapp', v_mensaje);
    end if;
    if admin_row.canal_email then
      insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'equipo_danado', 'email', v_mensaje);
    end if;
    if admin_row.canal_push then
      insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'equipo_danado', 'push', v_mensaje);
    end if;
  end loop;

  return NEW;
end;
$$;

create trigger trg_avisar_equipo_danado_perdido
  after update on equipos_catalogo
  for each row execute function avisar_equipo_danado_perdido();
