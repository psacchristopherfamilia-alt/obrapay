-- ============================================================================
-- 025 — Vehículos: catálogo, asignación a proyecto/conductor, y gastos
-- Segundo módulo de la ronda de "funciones para mi padre". Muy parecido a
-- Equipo (Corte 30), con una diferencia clave: el gasto de gasolina lo
-- reporta CUALQUIER trabajador que use el vehículo, no solo Admin o
-- Supervisor — así es como funciona hoy en la compañía real.
-- ============================================================================

create type estado_vehiculo as enum ('activo', 'en_reparacion', 'de_baja');

create table vehiculos_catalogo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  placa text,
  tipo text,
  estado estado_vehiculo not null default 'activo',
  proximo_mantenimiento date,
  aviso_mantenimiento_enviado boolean not null default false,
  creado_en timestamptz not null default now()
);
create index idx_vehiculos_empresa on vehiculos_catalogo(empresa_id);

create table vehiculo_asignaciones (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references vehiculos_catalogo(id) on delete cascade,
  proyecto_id uuid not null references proyectos(id),
  conductor_id uuid references usuarios(id),
  entregado_por uuid references usuarios(id),
  entregado_en timestamptz not null default now(),
  recibido_por uuid references usuarios(id),
  devuelto_en timestamptz
);
create index idx_vehiculo_asignaciones_vehiculo on vehiculo_asignaciones(vehiculo_id);
create index idx_vehiculo_asignaciones_proyecto on vehiculo_asignaciones(proyecto_id);

create table vehiculo_gastos (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references vehiculos_catalogo(id) on delete cascade,
  tipo text not null default 'gasolina', -- gasolina | mantenimiento | reparacion | otro
  monto numeric(10,2) not null,
  nota text,
  reportado_por uuid references usuarios(id),
  reportado_en timestamptz not null default now()
);
create index idx_vehiculo_gastos_vehiculo on vehiculo_gastos(vehiculo_id);

alter table vehiculos_catalogo enable row level security;

create policy vehiculos_catalogo_select on vehiculos_catalogo
  for select using (es_owner() or empresa_id = empresa_actual());

create policy vehiculos_catalogo_insert on vehiculos_catalogo
  for insert with check (es_admin() and empresa_id = empresa_actual());

create policy vehiculos_catalogo_update on vehiculos_catalogo
  for update using (es_admin() and empresa_id = empresa_actual())
  with check (es_admin() and empresa_id = empresa_actual());

create policy vehiculos_catalogo_delete on vehiculos_catalogo
  for delete using (es_admin() and empresa_id = empresa_actual());

alter table vehiculo_asignaciones enable row level security;

-- Mismo patrón que equipo_asignaciones: Admin o el Supervisor a cargo del
-- proyecto pueden asignar/devolver un vehículo.
create policy vehiculo_asignaciones_select on vehiculo_asignaciones
  for select using (
    es_owner()
    or proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

create policy vehiculo_asignaciones_insert on vehiculo_asignaciones
  for insert with check (
    proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

create policy vehiculo_asignaciones_update on vehiculo_asignaciones
  for update using (
    proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  )
  with check (
    proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

alter table vehiculo_gastos enable row level security;

-- Diferente a todo lo demás a propósito: CUALQUIER usuario autenticado de
-- la empresa puede reportar un gasto — es justo el "cada trabajador
-- reporta su propio consumo" que confirmó el usuario. No se restringe a
-- "el conductor actual" para no complicar la regla con el estado de la
-- asignación.
create policy vehiculo_gastos_select on vehiculo_gastos
  for select using (
    es_owner()
    or exists (
      select 1 from vehiculos_catalogo v where v.id = vehiculo_gastos.vehiculo_id and v.empresa_id = empresa_actual()
    )
  );

create policy vehiculo_gastos_insert on vehiculo_gastos
  for insert with check (
    exists (
      select 1 from vehiculos_catalogo v where v.id = vehiculo_gastos.vehiculo_id and v.empresa_id = empresa_actual()
    )
  );

create policy vehiculo_gastos_delete on vehiculo_gastos
  for delete using (
    es_admin()
    and exists (
      select 1 from vehiculos_catalogo v where v.id = vehiculo_gastos.vehiculo_id and v.empresa_id = empresa_actual()
    )
  );

-- ----------------------------------------------------------------------------
-- Aviso automático cuando el mantenimiento de un vehículo está por vencer
-- (3 días antes) — mismo patrón que avisar_trials_por_vencer.
-- ----------------------------------------------------------------------------
create or replace function avisar_mantenimiento_por_vencer()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  admin_row record;
  v_mensaje text;
begin
  for v in
    select id, empresa_id, nombre, proximo_mantenimiento
    from vehiculos_catalogo
    where estado = 'activo'
      and aviso_mantenimiento_enviado = false
      and proximo_mantenimiento is not null
      and proximo_mantenimiento <= (current_date + interval '3 days')
  loop
    v_mensaje := 'El vehículo "' || v.nombre || '" tiene mantenimiento programado para el ' ||
                 to_char(v.proximo_mantenimiento, 'DD/MM/YYYY') || '.';

    for admin_row in
      select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
             coalesce(ce.canal_email, true) as canal_email,
             coalesce(ce.canal_push, true) as canal_push
      from usuarios u
      left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
      where u.empresa_id = v.empresa_id and u.rol = 'admin'
    loop
      if admin_row.canal_whatsapp then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'mantenimiento_vehiculo', 'whatsapp', v_mensaje);
      end if;
      if admin_row.canal_email then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'mantenimiento_vehiculo', 'email', v_mensaje);
      end if;
      if admin_row.canal_push then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'mantenimiento_vehiculo', 'push', v_mensaje);
      end if;
    end loop;

    update vehiculos_catalogo set aviso_mantenimiento_enviado = true where id = v.id;
  end loop;
end;
$$;

select cron.schedule('avisar-mantenimiento-vehiculos', '0 13 * * *', $$select avisar_mantenimiento_por_vencer();$$);

revoke execute on function avisar_mantenimiento_por_vencer() from public, authenticated, anon;
