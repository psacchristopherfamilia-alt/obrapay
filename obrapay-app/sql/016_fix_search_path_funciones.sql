-- ============================================================================
-- 016 — search_path fijo en las funciones security definer restantes
-- La migración 011 corrigió empresa_actual(), es_owner(), es_admin() y
-- proyectos_a_cargo() agregándoles `set search_path = public`, pero se
-- quedaron 6 funciones más sin el mismo arreglo: cerrar_semana_actual,
-- cerrar_semanas_vencidas, cerrar_turnos_del_dia, vencer_trials,
-- avisar_trials_por_vencer y confirmar_pago_semanal. Un SECURITY DEFINER
-- sin search_path fijo es un vector clásico de escalación de privilegios
-- (alguien podría crear una tabla/función con el mismo nombre en un
-- esquema que quede antes en el search_path del rol, y la función
-- terminaría usando esa versión falsa sin saberlo).
--
-- Esto NO se encontró leyendo el código — lo encontró el linter de
-- seguridad de Supabase (`get_advisors`) al conectar el proyecto real por
-- primera vez. Es exactamente el tipo de cosa que una revisión manual
-- puede pasar por alto.
-- ============================================================================

create or replace function cerrar_semana_actual(p_empresa_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semana_id uuid;
  v_nueva_semana_id uuid;
begin
  select id into v_semana_id from semanas_pago
    where empresa_id = p_empresa_id and estado = 'abierta'
    order by fecha_inicio desc limit 1;

  if v_semana_id is null then
    raise exception 'No hay semana abierta para la empresa %', p_empresa_id;
  end if;

  update registros_horas
    set estado = 'cerrado_automatico'
    where usuario_id in (select id from usuarios where empresa_id = p_empresa_id)
      and hora_salida is null
      and estado = 'pendiente';

  update semanas_pago set estado = 'cerrada' where id = v_semana_id;

  insert into pagos_semanales
    (usuario_id, semana_id, horas_normales, horas_extra, bruto, descuento_seguro, descuento_prestamo, neto, estado)
  select
    r.usuario_id,
    v_semana_id,
    sum(r.horas_normales),
    sum(r.horas_extra),
    sum((r.horas_normales + r.horas_extra) * pn.tarifa_hora),
    sum((r.horas_normales + r.horas_extra) * pn.tarifa_hora) * (pn.porcentaje_seguro / 100.0),
    0,
    sum((r.horas_normales + r.horas_extra) * pn.tarifa_hora) * (1 - pn.porcentaje_seguro / 100.0),
    'pendiente'
  from registros_horas r
  join perfil_nomina pn on pn.usuario_id = r.usuario_id
  where r.usuario_id in (select id from usuarios where empresa_id = p_empresa_id)
    and r.estado in ('aprobado_supervisor', 'aprobado_admin_tarde')
    and r.pago_semanal_id is null
  group by r.usuario_id, pn.tarifa_hora, pn.porcentaje_seguro
  on conflict (usuario_id, semana_id) do nothing;

  update registros_horas r
    set pago_semanal_id = p.id
    from pagos_semanales p
    where p.semana_id = v_semana_id
      and p.usuario_id = r.usuario_id
      and r.estado in ('aprobado_supervisor', 'aprobado_admin_tarde')
      and r.pago_semanal_id is null;

  insert into pago_proyecto_detalle (pago_id, proyecto_id, horas, costo)
  select
    p.id,
    r.proyecto_id,
    sum(r.horas_normales + r.horas_extra),
    sum((r.horas_normales + r.horas_extra) * pn.tarifa_hora)
  from registros_horas r
  join perfil_nomina pn on pn.usuario_id = r.usuario_id
  join pagos_semanales p on p.usuario_id = r.usuario_id and p.semana_id = v_semana_id
  where r.pago_semanal_id = p.id
  group by p.id, r.proyecto_id;

  insert into semanas_pago (empresa_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
  select
    p_empresa_id,
    (fecha_cierre::date + 1),
    (fecha_cierre + interval '7 days'),
    (fecha_cierre::date + 2),
    'abierta'
  from semanas_pago where id = v_semana_id
  returning id into v_nueva_semana_id;

  return v_nueva_semana_id;
end;
$$;

create or replace function cerrar_semanas_vencidas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  for s in
    select distinct empresa_id from semanas_pago
    where estado = 'abierta' and fecha_cierre <= now()
  loop
    perform cerrar_semana_actual(s.empresa_id);
  end loop;
end;
$$;

create or replace function cerrar_turnos_del_dia()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select rh.id, rh.hora_entrada, rh.usuario_id, ce.hora_inicio_extra
    from registros_horas rh
    join usuarios u on u.id = rh.usuario_id
    join configuracion_empresa ce on ce.empresa_id = u.empresa_id
    where rh.hora_salida is null
      and rh.estado = 'pendiente'
      and (now() at time zone 'America/Grand_Turk')::time >= ce.hora_inicio_extra
      and (rh.hora_entrada at time zone 'America/Grand_Turk')::date
        = (now() at time zone 'America/Grand_Turk')::date
  loop
    update registros_horas
      set estado = 'cerrado_automatico'
      where id = r.id;
  end loop;
end;
$$;

create or replace function vencer_trials()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  v_plan_gratuito uuid;
begin
  select id into v_plan_gratuito from planes where clave = 'free';

  for e in
    select em.id, s.stripe_subscription_id
    from empresas em
    join suscripciones s on s.empresa_id = em.id
    where em.estado = 'trial' and em.trial_termina_en <= now()
  loop
    if e.stripe_subscription_id is null then
      update suscripciones
        set plan_id = v_plan_gratuito,
            fecha_renovacion = now() + interval '30 days'
        where empresa_id = e.id;
    end if;

    update empresas set estado = 'active' where id = e.id;
  end loop;
end;
$$;

create or replace function avisar_trials_por_vencer()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  admin_row record;
  v_mensaje text;
begin
  for e in
    select id, nombre, trial_termina_en
    from empresas
    where estado = 'trial'
      and aviso_trial_enviado = false
      and trial_termina_en > now()
      and trial_termina_en <= now() + interval '3 days'
  loop
    v_mensaje := 'Tu prueba de OBRAPAY vence el ' || to_char(e.trial_termina_en, 'DD/MM/YYYY') ||
                 '. Elige un plan para no perder geo-cerca, alertas de sobrepresupuesto y firma digital.';

    for admin_row in
      select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
             coalesce(ce.canal_email, true) as canal_email,
             coalesce(ce.canal_push, true) as canal_push
      from usuarios u
      left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
      where u.empresa_id = e.id and u.rol = 'admin'
    loop
      if admin_row.canal_whatsapp then
        insert into notificaciones (usuario_id, tipo, canal, mensaje)
          values (admin_row.id, 'prueba_por_vencer', 'whatsapp', v_mensaje);
      end if;
      if admin_row.canal_email then
        insert into notificaciones (usuario_id, tipo, canal, mensaje)
          values (admin_row.id, 'prueba_por_vencer', 'email', v_mensaje);
      end if;
      if admin_row.canal_push then
        insert into notificaciones (usuario_id, tipo, canal, mensaje)
          values (admin_row.id, 'prueba_por_vencer', 'push', v_mensaje);
      end if;
    end loop;

    update empresas set aviso_trial_enviado = true where id = e.id;
  end loop;
end;
$$;

create or replace function confirmar_pago_semanal(p_pago_id uuid, p_descuento_prestamo numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago record;
  v_prestamo_id uuid;
begin
  select * into v_pago from pagos_semanales where id = p_pago_id;
  if v_pago is null then
    raise exception 'Pago no encontrado';
  end if;

  if not exists (
    select 1 from usuarios admin
    join usuarios trabajador on trabajador.empresa_id = admin.empresa_id
    where admin.id = auth.uid() and admin.rol = 'admin' and trabajador.id = v_pago.usuario_id
  ) then
    raise exception 'No autorizado';
  end if;

  update pagos_semanales
    set descuento_prestamo = p_descuento_prestamo,
        neto = bruto - descuento_seguro - p_descuento_prestamo,
        estado = 'pagado'
    where id = p_pago_id;

  if p_descuento_prestamo > 0 then
    select id into v_prestamo_id from prestamos
      where usuario_id = v_pago.usuario_id and estado = 'activo'
      order by otorgado_en asc limit 1;

    if v_prestamo_id is not null then
      insert into prestamo_descuentos (prestamo_id, semana_id, monto)
        values (v_prestamo_id, v_pago.semana_id, p_descuento_prestamo);

      update prestamos
        set saldo_pendiente = greatest(0, saldo_pendiente - p_descuento_prestamo),
            estado = case when saldo_pendiente - p_descuento_prestamo <= 0 then 'pagado' else 'activo' end
        where id = v_prestamo_id;
    end if;
  end if;
end;
$$;

revoke execute on function cerrar_semana_actual(uuid) from public, authenticated, anon;
revoke execute on function cerrar_semanas_vencidas() from public, authenticated, anon;
revoke execute on function cerrar_turnos_del_dia() from public, authenticated, anon;
revoke execute on function vencer_trials() from public, authenticated, anon;
revoke execute on function avisar_trials_por_vencer() from public, authenticated, anon;
grant execute on function confirmar_pago_semanal(uuid, numeric) to authenticated;
