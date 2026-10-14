-- ============================================================================
-- 030 — Permiso de trabajo (elegibilidad legal, no una habilidad)
-- Distinto a certificaciones_trabajador a propósito: un permiso de
-- trabajo es elegibilidad legal para trabajar, normalmente uno solo por
-- persona — no una lista de credenciales que alguien puede tener varias.
-- Por eso vive como campos del perfil, no como fila en una tabla de lista,
-- y puede llenarse desde el mismo formulario de alta del trabajador.
-- Solo aplica a algunos trabajadores (extranjeros) — por eso todo es
-- opcional y hay un interruptor explícito, no basta con dejarlo en blanco.
-- ============================================================================

alter table perfil_nomina
  add column if not exists requiere_permiso_trabajo boolean not null default false,
  add column if not exists permiso_trabajo_numero text,
  add column if not exists permiso_trabajo_vencimiento date,
  add column if not exists permiso_trabajo_aviso_enviado boolean not null default false;

-- ----------------------------------------------------------------------------
-- Aviso con 3 meses de anticipación — un trámite de permiso de trabajo no
-- se resuelve en una semana, a diferencia del mantenimiento de un
-- vehículo (3 días) o incluso una certificación profesional (15 días).
-- ----------------------------------------------------------------------------
create or replace function avisar_permiso_trabajo_por_vencer()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  perm record;
  admin_row record;
  v_mensaje text;
begin
  for perm in
    select pn.usuario_id, pn.permiso_trabajo_vencimiento, u.nombre as trabajador_nombre, u.empresa_id
    from perfil_nomina pn
    join usuarios u on u.id = pn.usuario_id
    where pn.requiere_permiso_trabajo = true
      and pn.permiso_trabajo_aviso_enviado = false
      and pn.permiso_trabajo_vencimiento is not null
      and pn.permiso_trabajo_vencimiento <= (current_date + interval '3 months')
  loop
    v_mensaje := 'El permiso de trabajo de ' || perm.trabajador_nombre ||
                 ' vence el ' || to_char(perm.permiso_trabajo_vencimiento, 'DD/MM/YYYY') || '.';

    for admin_row in
      select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
             coalesce(ce.canal_email, true) as canal_email,
             coalesce(ce.canal_push, true) as canal_push
      from usuarios u
      left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
      where u.empresa_id = perm.empresa_id and u.rol = 'admin'
    loop
      if admin_row.canal_whatsapp then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'permiso_trabajo_por_vencer', 'whatsapp', v_mensaje);
      end if;
      if admin_row.canal_email then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'permiso_trabajo_por_vencer', 'email', v_mensaje);
      end if;
      if admin_row.canal_push then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'permiso_trabajo_por_vencer', 'push', v_mensaje);
      end if;
    end loop;

    update perfil_nomina set permiso_trabajo_aviso_enviado = true where usuario_id = perm.usuario_id;
  end loop;
end;
$$;

select cron.schedule('avisar-permiso-trabajo-vencer', '0 13 * * *', $$select avisar_permiso_trabajo_por_vencer();$$);

revoke execute on function avisar_permiso_trabajo_por_vencer() from public, authenticated, anon;
