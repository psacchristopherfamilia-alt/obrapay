-- ============================================================================
-- 005 — Cierre de semana y cálculo de nómina
-- ============================================================================

alter table registros_horas
  add column if not exists pago_semanal_id uuid references pagos_semanales(id);

-- ----------------------------------------------------------------------------
-- Cierra la semana abierta de UNA empresa y genera los pagos en borrador.
-- El descuento de préstamo queda en 0 — el Admin lo confirma manualmente
-- (así lo definimos: el monto varía cada semana, no se automatiza).
-- ----------------------------------------------------------------------------
create or replace function cerrar_semana_actual(p_empresa_id uuid)
returns uuid
language plpgsql
security definer
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

  -- Turnos sin salida marcada quedan cerrados automáticamente. No se les
  -- puede calcular horas sin una hora de salida real, así que se quedan
  -- pendientes hasta que un supervisor/admin les ponga una hora de salida
  -- y los apruebe — en ese momento entran en el barrido de "no pagadas
  -- todavía" de la siguiente ejecución de este cierre.
  update registros_horas
    set estado = 'cerrado_automatico'
    where usuario_id in (select id from usuarios where empresa_id = p_empresa_id)
      and hora_salida is null
      and estado = 'pendiente';

  update semanas_pago set estado = 'cerrada' where id = v_semana_id;

  -- Genera un pago por trabajador sumando TODAS sus horas aprobadas que aún
  -- no se han pagado — sin importar de qué semana son. Así es como una hora
  -- aprobada tarde (después del cierre) se paga sola en la nómina siguiente,
  -- sin necesitar una tabla ni una pantalla aparte para "atrasados".
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

  -- Marca esas horas como ya incluidas en un pago, para no volver a
  -- contarlas si el cierre se corre de nuevo.
  update registros_horas r
    set pago_semanal_id = p.id
    from pagos_semanales p
    where p.semana_id = v_semana_id
      and p.usuario_id = r.usuario_id
      and r.estado in ('aprobado_supervisor', 'aprobado_admin_tarde')
      and r.pago_semanal_id is null;

  -- Desglose de costo por proyecto (para el Panel y "costo por proyecto")
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

  -- Abre la semana siguiente
  insert into semanas_pago (empresa_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
  select
    p_empresa_id,
    (fecha_cierre::date + 1),
    (fecha_cierre + interval '7 days'),
    (fecha_cierre::date + 2), -- viernes después del cierre del miércoles
    'abierta'
  from semanas_pago where id = v_semana_id
  returning id into v_nueva_semana_id;

  return v_nueva_semana_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Corre el cierre para toda empresa cuya semana abierta ya venció.
-- Se agenda cada 15 minutos (no a una hora fija) precisamente para no
-- depender de convertir zonas horarias en el cron — fecha_cierre ya es un
-- timestamptz correcto desde que se creó la semana, así que comparar contra
-- now() es seguro incluso cruzando el cambio de horario de verano.
-- ----------------------------------------------------------------------------
create or replace function cerrar_semanas_vencidas()
returns void
language plpgsql
security definer
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

-- Requiere la extensión pg_cron (Database → Extensions, en Supabase).
select cron.schedule('cierre-semanal-obrapay', '*/15 * * * *', $$select cerrar_semanas_vencidas();$$);

-- Solo el service role (cron, rutas de servidor) puede ejecutar el cierre —
-- ningún usuario final debe poder dispararlo directo por RPC.
revoke execute on function cerrar_semana_actual(uuid) from public, authenticated, anon;
revoke execute on function cerrar_semanas_vencidas() from public, authenticated, anon;

-- ----------------------------------------------------------------------------
-- Confirmación manual del Admin: escribe el descuento de préstamo de la
-- semana y marca el pago como pagado. Esta SÍ la llama el Admin desde la
-- app (vía RPC con su propia sesión), por eso valida el rol adentro.
-- ----------------------------------------------------------------------------
create or replace function confirmar_pago_semanal(p_pago_id uuid, p_descuento_prestamo numeric)
returns void
language plpgsql
security definer
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

grant execute on function confirmar_pago_semanal(uuid, numeric) to authenticated;
