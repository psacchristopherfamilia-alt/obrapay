-- ============================================================================
-- 033 — Horas calculadas en el servidor, registros blindados, tarifa por
--       registro, fechas en zona horaria local, cierre automático corregido,
--       descuento de almuerzo y primera semana automática.
-- ============================================================================

alter table configuracion_empresa
  add column if not exists zona_horaria text not null default 'America/Grand_Turk',
  add column if not exists hora_cierre_automatico time not null default '23:00',
  add column if not exists descuento_almuerzo_horas numeric(3,2) not null default 1.00,
  add column if not exists almuerzo_min_horas_turno numeric(4,2) not null default 5.00;

alter table registros_horas
  add column if not exists tarifa_aplicada numeric(10,2);

-- Horas normales/extra de un turno, según la configuración de la empresa.
create or replace function calcular_horas_turno(p_empresa uuid, p_entrada timestamptz, p_salida timestamptz)
returns table(normales numeric, extra numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  c record; v_tz text; v_limite timestamptz; v_total numeric; v_inicio timestamptz;
  v_n numeric; v_e numeric; v_ded numeric;
begin
  select coalesce(hora_inicio_extra,'17:00') h, coalesce(zona_horaria,'America/Grand_Turk') tz,
         coalesce(descuento_almuerzo_horas,0) alm, coalesce(almuerzo_min_horas_turno,5) alm_min
    into c from configuracion_empresa where empresa_id = p_empresa;
  if not found then c := row('17:00'::time,'America/Grand_Turk',0::numeric,5::numeric); end if;
  v_tz := c.tz;
  v_limite := ((p_entrada at time zone v_tz)::date + c.h) at time zone v_tz;
  v_total := extract(epoch from (p_salida - p_entrada)) / 3600.0;
  if p_salida <= v_limite then
    v_n := v_total; v_e := 0;
  else
    v_inicio := greatest(p_entrada, v_limite);
    v_n := greatest(0, extract(epoch from (v_inicio - p_entrada)) / 3600.0);
    v_e := extract(epoch from (p_salida - v_inicio)) / 3600.0;
  end if;
  if c.alm > 0 and v_total >= c.alm_min then
    v_ded := least(c.alm, v_n);
    v_n := v_n - v_ded;
  end if;
  return query select round(greatest(v_n,0), 2), round(greatest(v_e,0), 2);
end $$;
revoke execute on function calcular_horas_turno(uuid,timestamptz,timestamptz) from public, anon, authenticated;

-- Blindaje: el servidor decide hora, horas, estado y tarifa. El cliente no.
create or replace function registros_horas_servidor()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_emp uuid;
  v_priv boolean;
  v_ub point;
  h record;
begin
  select empresa_id into v_emp from usuarios where id = new.usuario_id;
  v_priv := v_uid is null or es_owner() or es_admin()
            or (new.usuario_id <> v_uid and new.proyecto_id in (select proyectos_a_cargo()));

  if tg_op = 'INSERT' then
    if new.tarifa_aplicada is null then
      select tarifa_hora into new.tarifa_aplicada from perfil_nomina where usuario_id = new.usuario_id;
    end if;
    if not v_priv then
      if not exists (select 1 from proyecto_trabajadores where proyecto_id = new.proyecto_id and usuario_id = new.usuario_id) then
        raise exception 'No estás asignado a este proyecto';
      end if;
      new.hora_entrada := now();
      new.hora_salida := null;
      new.estado := 'pendiente';
      new.aprobado_por := null; new.fecha_aprobacion := null; new.pago_semanal_id := null;
      new.horas_normales := 0; new.horas_extra := 0;
      select id into new.semana_id from semanas_pago where empresa_id = v_emp and estado = 'abierta' order by fecha_inicio desc limit 1;
      if new.semana_id is null then raise exception 'No hay una semana de pago abierta'; end if;
    end if;
  else
    if not v_priv then
      if old.hora_salida is not null or old.estado <> 'pendiente' then
        raise exception 'Este registro ya está cerrado: solo un supervisor o administrador puede modificarlo';
      end if;
      v_ub := new.ubicacion_salida;
      new := old;
      new.ubicacion_salida := v_ub;
      new.hora_salida := now();
    elsif v_uid is not null and old.pago_semanal_id is not null then
      raise exception 'Este registro ya fue pagado y no se puede modificar';
    end if;
    if v_priv and v_uid is not null and new.estado in ('aprobado_supervisor','aprobado_admin_tarde')
       and old.estado is distinct from new.estado then
      if new.hora_salida is null then raise exception 'No se puede aprobar un turno sin hora de salida'; end if;
      new.aprobado_por := v_uid; new.fecha_aprobacion := now();
    end if;
  end if;

  if new.hora_salida is not null and (tg_op = 'INSERT' or new.hora_entrada is distinct from old.hora_entrada
       or new.hora_salida is distinct from old.hora_salida) then
    if new.hora_salida <= new.hora_entrada then raise exception 'La salida debe ser posterior a la entrada'; end if;
    select * into h from calcular_horas_turno(v_emp, new.hora_entrada, new.hora_salida);
    new.horas_normales := h.normales; new.horas_extra := h.extra;
  end if;
  return new;
end $$;

drop trigger if exists trg_registros_horas_servidor on registros_horas;
create trigger trg_registros_horas_servidor
  before insert or update on registros_horas
  for each row execute function registros_horas_servidor();

-- Cierre automático: ya NO a las 5pm (después de las 5 son horas extra).
-- Cierra turnos de días anteriores y los de hoy pasada hora_cierre_automatico.
create or replace function cerrar_turnos_del_dia()
returns void language plpgsql security definer set search_path = public as $$
begin
  update registros_horas rh set estado = 'cerrado_automatico'
  from usuarios u join configuracion_empresa ce on ce.empresa_id = u.empresa_id
  where u.id = rh.usuario_id and rh.hora_salida is null and rh.estado = 'pendiente'
    and ( (rh.hora_entrada at time zone ce.zona_horaria)::date < (now() at time zone ce.zona_horaria)::date
       or (now() at time zone ce.zona_horaria)::time >= ce.hora_cierre_automatico );
end $$;

-- Primera semana automática al crear una empresa (jueves a miércoles 11:59pm).
create or replace function abrir_primera_semana(p_empresa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tz text; v_hoy date; v_ini date;
begin
  if exists (select 1 from semanas_pago where empresa_id = p_empresa and estado = 'abierta') then return; end if;
  select coalesce((select zona_horaria from configuracion_empresa where empresa_id = p_empresa), 'America/Grand_Turk') into v_tz;
  v_hoy := (now() at time zone v_tz)::date;
  v_ini := v_hoy - ((extract(isodow from v_hoy)::int - 4 + 7) % 7);
  insert into semanas_pago (empresa_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
  values (p_empresa, v_ini, ((v_ini + 6) + time '23:59:59') at time zone v_tz, v_ini + 8, 'abierta');
end $$;
revoke execute on function abrir_primera_semana(uuid) from public, anon, authenticated;

create or replace function trg_empresa_primera_semana() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform abrir_primera_semana(new.id); return new; end $$;
drop trigger if exists trg_empresas_primera_semana on empresas;
create trigger trg_empresas_primera_semana after insert on empresas
  for each row execute function trg_empresa_primera_semana();

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
  v_tz text;
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
           sum((rh.horas_normales + rh.horas_extra) * coalesce(rh.tarifa_aplicada, pn.tarifa_hora)) as bruto
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
    sum((r.horas_normales + r.horas_extra) * coalesce(r.tarifa_aplicada, pn.tarifa_hora))
  from registros_horas r
  join perfil_nomina pn on pn.usuario_id = r.usuario_id
  join pagos_semanales p on p.usuario_id = r.usuario_id and p.semana_id = v_semana_id
  where r.pago_semanal_id = p.id
  group by p.id, r.proyecto_id;

  select coalesce((select zona_horaria from configuracion_empresa where empresa_id = p_empresa_id), 'America/Grand_Turk') into v_tz;

  -- Fechas calculadas en la zona horaria de la empresa (no en UTC): el
  -- cierre es miércoles 11:59pm LOCAL, que en UTC ya es jueves.
  insert into semanas_pago (empresa_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
  select
    p_empresa_id,
    ((fecha_cierre at time zone v_tz)::date + 1),
    (((fecha_cierre at time zone v_tz) + interval '7 days') at time zone v_tz),
    ((fecha_cierre at time zone v_tz)::date + 2),
    'abierta'
  from semanas_pago where id = v_semana_id
  returning id into v_nueva_semana_id;

  return v_nueva_semana_id;
end;
$$;
revoke execute on function cerrar_semana_actual(uuid) from public, authenticated, anon;
