-- ============================================================================
-- 029 — Certificaciones/licencias de trabajadores
-- Cuarto módulo de la ronda de "funciones para mi padre". A diferencia
-- del aviso de mantenimiento de vehículos (3 días), este avisa con 15
-- días de anticipación — renovar una licencia de electricista u operador
-- de maquinaria toma más que llevar un carro al taller.
-- ============================================================================

create table certificaciones_trabajador (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  nombre text not null,
  numero_certificado text,
  fecha_vencimiento date,
  aviso_enviado boolean not null default false,
  creado_en timestamptz not null default now()
);
create index idx_certificaciones_usuario on certificaciones_trabajador(usuario_id);

alter table certificaciones_trabajador enable row level security;

-- Mismo nivel de acceso que historial_tarifas: es dato de la persona, no
-- operación de obra del día a día — Admin de la empresa, el propio
-- trabajador (para ver las suyas), y el Owner.
create policy certificaciones_select on certificaciones_trabajador
  for select using (
    es_owner()
    or usuario_id = auth.uid()
    or (es_admin() and usuario_id in (select id from usuarios where empresa_id = empresa_actual()))
  );

create policy certificaciones_write on certificaciones_trabajador
  for all using (es_admin() and usuario_id in (select id from usuarios where empresa_id = empresa_actual()))
  with check (es_admin() and usuario_id in (select id from usuarios where empresa_id = empresa_actual()));

-- ----------------------------------------------------------------------------
-- Aviso automático 15 días antes de vencer una certificación.
-- ----------------------------------------------------------------------------
create or replace function avisar_certificacion_por_vencer()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cert record;
  admin_row record;
  v_mensaje text;
  v_empresa_id uuid;
  v_nombre_trabajador text;
begin
  for cert in
    select ct.id, ct.usuario_id, ct.nombre, ct.fecha_vencimiento, u.empresa_id, u.nombre as trabajador_nombre
    from certificaciones_trabajador ct
    join usuarios u on u.id = ct.usuario_id
    where ct.aviso_enviado = false
      and ct.fecha_vencimiento is not null
      and ct.fecha_vencimiento <= (current_date + interval '15 days')
  loop
    v_mensaje := 'La certificación "' || cert.nombre || '" de ' || cert.trabajador_nombre ||
                 ' vence el ' || to_char(cert.fecha_vencimiento, 'DD/MM/YYYY') || '.';

    for admin_row in
      select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
             coalesce(ce.canal_email, true) as canal_email,
             coalesce(ce.canal_push, true) as canal_push
      from usuarios u
      left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
      where u.empresa_id = cert.empresa_id and u.rol = 'admin'
    loop
      if admin_row.canal_whatsapp then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'certificacion_por_vencer', 'whatsapp', v_mensaje);
      end if;
      if admin_row.canal_email then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'certificacion_por_vencer', 'email', v_mensaje);
      end if;
      if admin_row.canal_push then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'certificacion_por_vencer', 'push', v_mensaje);
      end if;
    end loop;

    update certificaciones_trabajador set aviso_enviado = true where id = cert.id;
  end loop;
end;
$$;

select cron.schedule('avisar-certificaciones-vencer', '0 13 * * *', $$select avisar_certificacion_por_vencer();$$);

revoke execute on function avisar_certificacion_por_vencer() from public, authenticated, anon;
