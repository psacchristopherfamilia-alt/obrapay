-- ============================================================================
-- 031 — NIB y NHIP separados de verdad (no un solo "% de seguro")
-- Hasta ahora, `porcentaje_seguro` era un único número por trabajador sin
-- relación con cómo funciona de verdad la nómina en Turks and Caicos: son
-- DOS contribuciones a DOS agencias distintas (NIB y NHIP), cada una con
-- su propia tasa patronal/empleado y su propio TOPE MENSUAL de ingreso
-- asegurable. Confirmado por búsqueda web, no inventado — y por eso las
-- tasas quedan configurables por empresa, no fijas en el código: pueden
-- cambiar, y deben confirmarse con un contador, no con este chat.
--
-- El reto real: el tope es MENSUAL pero la nómina cierra SEMANAL. Una
-- persona puede pasar el tope a mitad de mes, dentro de una semana de
-- pago. Por eso cerrar_semana_actual() ahora consulta cuánto ganó ya ese
-- trabajador en semanas de este mismo mes calendario antes de calcular
-- cuánto de ESTA semana todavía cuenta para el tope.
-- ============================================================================

alter table configuracion_empresa
  add column if not exists nib_tasa_empleador numeric(5,2) not null default 6.5,
  add column if not exists nib_tasa_empleado numeric(5,2) not null default 5.5,
  add column if not exists nib_tope_mensual numeric(10,2) not null default 6000,
  add column if not exists nhip_tasa_empleador numeric(5,2) not null default 3.0,
  add column if not exists nhip_tasa_empleado numeric(5,2) not null default 3.0,
  add column if not exists nhip_tope_mensual numeric(10,2) not null default 7800;

alter table pagos_semanales
  add column if not exists descuento_nib numeric(10,2) not null default 0,
  add column if not exists descuento_nhip numeric(10,2) not null default 0,
  add column if not exists aporte_patronal_nib numeric(10,2) not null default 0,
  add column if not exists aporte_patronal_nhip numeric(10,2) not null default 0;

create or replace function cerrar_semana_actual(p_empresa_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semana_id uuid;
  v_semana_fecha_inicio date;
  v_nueva_semana_id uuid;
  v_nib_tasa_empleador numeric; v_nib_tasa_empleado numeric; v_nib_tope numeric;
  v_nhip_tasa_empleador numeric; v_nhip_tasa_empleado numeric; v_nhip_tope numeric;
  v_reg record;
  v_bruto_acumulado_antes numeric;
  v_nib_contribuible numeric;
  v_nhip_contribuible numeric;
  v_descuento_seguro numeric;
  v_pago_id uuid;
begin
  select id, fecha_inicio into v_semana_id, v_semana_fecha_inicio from semanas_pago
    where empresa_id = p_empresa_id and estado = 'abierta'
    order by fecha_inicio desc limit 1;

  if v_semana_id is null then
    raise exception 'No hay semana abierta para la empresa %', p_empresa_id;
  end if;

  select coalesce(nib_tasa_empleador, 6.5), coalesce(nib_tasa_empleado, 5.5), coalesce(nib_tope_mensual, 6000),
         coalesce(nhip_tasa_empleador, 3.0), coalesce(nhip_tasa_empleado, 3.0), coalesce(nhip_tope_mensual, 7800)
    into v_nib_tasa_empleador, v_nib_tasa_empleado, v_nib_tope,
         v_nhip_tasa_empleador, v_nhip_tasa_empleado, v_nhip_tope
    from configuracion_empresa where empresa_id = p_empresa_id;

  update registros_horas
    set estado = 'cerrado_automatico'
    where usuario_id in (select id from usuarios where empresa_id = p_empresa_id)
      and hora_salida is null
      and estado = 'pendiente';

  update semanas_pago set estado = 'cerrada' where id = v_semana_id;

  for v_reg in
    select rh.usuario_id, sum(rh.horas_normales) as horas_normales, sum(rh.horas_extra) as horas_extra,
           sum((rh.horas_normales + rh.horas_extra) * pn.tarifa_hora) as bruto
    from registros_horas rh
    join perfil_nomina pn on pn.usuario_id = rh.usuario_id
    where rh.usuario_id in (select id from usuarios where empresa_id = p_empresa_id)
      and rh.estado in ('aprobado_supervisor', 'aprobado_admin_tarde')
      and rh.pago_semanal_id is null
    group by rh.usuario_id
  loop
    v_pago_id := null;

    -- Cuánto ganó ya este trabajador en semanas de este mismo mes
    -- calendario, ya cerradas — para saber cuánto del tope mensual ya se
    -- usó antes de esta semana.
    select coalesce(sum(ps.bruto), 0) into v_bruto_acumulado_antes
      from pagos_semanales ps
      join semanas_pago sp on sp.id = ps.semana_id
      where ps.usuario_id = v_reg.usuario_id
        and date_trunc('month', sp.fecha_inicio) = date_trunc('month', v_semana_fecha_inicio);

    v_nib_contribuible := least(v_bruto_acumulado_antes + v_reg.bruto, v_nib_tope) - least(v_bruto_acumulado_antes, v_nib_tope);
    v_nhip_contribuible := least(v_bruto_acumulado_antes + v_reg.bruto, v_nhip_tope) - least(v_bruto_acumulado_antes, v_nhip_tope);

    v_descuento_seguro := v_nib_contribuible * (v_nib_tasa_empleado / 100.0) + v_nhip_contribuible * (v_nhip_tasa_empleado / 100.0);

    insert into pagos_semanales
      (usuario_id, semana_id, horas_normales, horas_extra, bruto,
       descuento_nib, descuento_nhip, aporte_patronal_nib, aporte_patronal_nhip,
       descuento_seguro, descuento_prestamo, neto, estado)
    values (
      v_reg.usuario_id, v_semana_id, v_reg.horas_normales, v_reg.horas_extra, v_reg.bruto,
      v_nib_contribuible * (v_nib_tasa_empleado / 100.0),
      v_nhip_contribuible * (v_nhip_tasa_empleado / 100.0),
      v_nib_contribuible * (v_nib_tasa_empleador / 100.0),
      v_nhip_contribuible * (v_nhip_tasa_empleador / 100.0),
      v_descuento_seguro, 0, v_reg.bruto - v_descuento_seguro, 'pendiente'
    )
    on conflict (usuario_id, semana_id) do nothing
    returning id into v_pago_id;

    if v_pago_id is not null then
      update registros_horas
        set pago_semanal_id = v_pago_id
        where usuario_id = v_reg.usuario_id
          and estado in ('aprobado_supervisor', 'aprobado_admin_tarde')
          and pago_semanal_id is null;
    end if;
  end loop;

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

revoke execute on function cerrar_semana_actual(uuid) from public, authenticated, anon;
