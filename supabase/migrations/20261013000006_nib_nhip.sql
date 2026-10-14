-- ObraPay · NIB y NHIP con topes y fechas propias (reemplaza el "seguro %")
-- Esta migración ya está aplicada en la base de producción (version 20261013104003, obrapay_06_nib_nhip);
-- aquí queda para que el repositorio y las pruebas coincidan con producción.
-- Origen: Radar de oportunidades TCI (OPP-1), ver docs/radar-seguros-nib-nhip.md
-- Las tasas de partida (NIB 5.5%/6.5% tope $6,000 día 15; NHIP 3%/3% tope $7,800 día 14) vienen de
-- TriblockHR (abr-2026) y las fuentes no coinciden: confirmar con el NIB o un contador.
--
-- Reglas:
--   · Cada agencia tiene su tasa de empleado y de empleador, su tope mensual y su día de vencimiento,
--     con vigencia por fecha (se usa la tasa vigente en el viernes de pago de la semana).
--   · El mes de una semana es el de su viernes de pago (fin + 2).
--   · Contribuible = lo que cabe bajo el tope después del bruto ya acumulado en semanas cerradas del mismo mes.
--   · El descuento al trabajador (`seguro`) = NIB empleado + NHIP empleado. El aporte del empleador solo se reporta.
--   · La tarifa por hora no puede quedar bajo el salario mínimo de la empresa (por defecto $9.00, construcción).

create table if not exists public.tasas_estatutarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  agencia text not null check (agencia in ('NIB', 'NHIP')),
  vigente_desde date not null,
  tasa_empleado numeric(5,3) not null check (tasa_empleado >= 0 and tasa_empleado <= 100),
  tasa_empleador numeric(5,3) not null check (tasa_empleador >= 0 and tasa_empleador <= 100),
  tope_mensual numeric(12,2) not null check (tope_mensual > 0),
  dia_vencimiento integer not null check (dia_vencimiento between 1 and 28),
  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  unique (empresa_id, agencia, vigente_desde)
);
alter table public.tasas_estatutarias enable row level security;
create policy tasas_ver on public.tasas_estatutarias for select to authenticated using (empresa_id = public.mi_empresa());
revoke all on public.tasas_estatutarias from anon, authenticated;
grant select on public.tasas_estatutarias to authenticated;

create or replace function public._sembrar_tasas(p_empresa uuid)
returns void language sql security definer set search_path to 'public' as $$
  insert into tasas_estatutarias (empresa_id, agencia, vigente_desde, tasa_empleado, tasa_empleador, tope_mensual, dia_vencimiento)
  values (p_empresa, 'NIB', date '2026-01-01', 5.5, 6.5, 6000, 15), (p_empresa, 'NHIP', date '2026-01-01', 3.0, 3.0, 7800, 14)
  on conflict (empresa_id, agencia, vigente_desde) do nothing
$$;
select public._sembrar_tasas(id) from public.empresas;

create or replace function public._tr_empresa_sembrar_tasas()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin perform public._sembrar_tasas(new.id); return new; end $$;
create or replace trigger empresa_sembrar_tasas after insert on public.empresas
  for each row execute function public._tr_empresa_sembrar_tasas();

create or replace function public.tasa_vigente(p_empresa uuid, p_agencia text, p_fecha date)
returns public.tasas_estatutarias language sql stable security definer set search_path to 'public' as $$
  select * from tasas_estatutarias where empresa_id = p_empresa and agencia = p_agencia and vigente_desde <= p_fecha
  order by vigente_desde desc limit 1
$$;

create or replace function public.cambiar_tasa_estatutaria(
  p_agencia text, p_desde date, p_tasa_empleado numeric, p_tasa_empleador numeric,
  p_tope_mensual numeric, p_dia_vencimiento integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.mi_empresa();
begin
  perform public._exigir_rol('admin');
  if p_agencia not in ('NIB', 'NHIP') then raise exception 'Agencia inválida (NIB o NHIP)'; end if;
  if p_desde is null then raise exception 'Falta la fecha de vigencia'; end if;
  if p_tasa_empleado is null or p_tasa_empleado < 0 or p_tasa_empleado > 100 or p_tasa_empleador is null or p_tasa_empleador < 0 or p_tasa_empleador > 100 then
    raise exception 'Las tasas deben estar entre 0 y 100';
  end if;
  if p_tope_mensual is null or p_tope_mensual <= 0 then raise exception 'El tope mensual debe ser mayor que cero'; end if;
  if p_dia_vencimiento is null or p_dia_vencimiento not between 1 and 28 then raise exception 'El día de vencimiento debe estar entre 1 y 28'; end if;
  insert into tasas_estatutarias (empresa_id, agencia, vigente_desde, tasa_empleado, tasa_empleador, tope_mensual, dia_vencimiento, creado_por)
  values (v_emp, p_agencia, p_desde, p_tasa_empleado, p_tasa_empleador, round(p_tope_mensual, 2), p_dia_vencimiento, auth.uid())
  on conflict (empresa_id, agencia, vigente_desde) do update
    set tasa_empleado = excluded.tasa_empleado, tasa_empleador = excluded.tasa_empleador, tope_mensual = excluded.tope_mensual,
        dia_vencimiento = excluded.dia_vencimiento, creado_por = excluded.creado_por;
  perform public._evento(v_emp, 'cambio_tasa_estatutaria', jsonb_build_object('agencia', p_agencia, 'desde', p_desde,
    'tasa_empleado', p_tasa_empleado, 'tasa_empleador', p_tasa_empleador, 'tope_mensual', p_tope_mensual, 'dia_vencimiento', p_dia_vencimiento));
end $$;

alter table public.perfiles add column if not exists numero_nib text, add column if not exists numero_nhip text,
  add column if not exists permiso_trabajo_aprobado date;
alter table public.empresas add column if not exists salario_minimo_hora numeric(6,2) not null default 9.00 check (salario_minimo_hora > 0);

create or replace function public.actualizar_datos_estatutarios(p_perfil uuid, p_numero_nib text, p_numero_nhip text, p_permiso_aprobado date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.mi_empresa();
begin
  perform public._exigir_rol('admin');
  update perfiles set numero_nib = nullif(trim(p_numero_nib), ''), numero_nhip = nullif(trim(p_numero_nhip), ''),
         permiso_trabajo_aprobado = p_permiso_aprobado
   where id = p_perfil and empresa_id = v_emp;
  if not found then raise exception 'Trabajador no encontrado'; end if;
  perform public._evento(v_emp, 'datos_estatutarios', jsonb_build_object('perfil', p_perfil));
end $$;

create or replace function public.cambiar_tarifa(p_perfil uuid, p_monto numeric, p_desde date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.mi_empresa(); v_antes numeric; v_minimo numeric;
begin
  perform public._exigir_rol('admin');
  if not exists (select 1 from perfiles where id = p_perfil and empresa_id = v_emp) then raise exception 'Trabajador no encontrado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'La tarifa debe ser mayor que cero'; end if;
  select salario_minimo_hora into v_minimo from empresas where id = v_emp;
  if round(p_monto, 2) < v_minimo then
    raise exception 'La tarifa ($%/h) está por debajo del salario mínimo de la empresa ($%/h)', round(p_monto, 2), v_minimo;
  end if;
  v_antes := public.tarifa_vigente(p_perfil, p_desde);
  insert into tarifas (empresa_id, perfil_id, monto_hora, vigente_desde, creado_por)
  values (v_emp, p_perfil, round(p_monto, 2), p_desde, auth.uid())
  on conflict (perfil_id, vigente_desde) do update set monto_hora = excluded.monto_hora, creado_por = excluded.creado_por;
  if v_antes is distinct from round(p_monto, 2) then
    insert into notificaciones (empresa_id, perfil_id, tipo, datos)
    values (v_emp, p_perfil, 'cambio_tarifa', jsonb_build_object('antes', v_antes, 'despues', round(p_monto, 2), 'desde', p_desde));
  end if;
  perform public._evento(v_emp, 'cambio_tarifa', jsonb_build_object('perfil', p_perfil, 'antes', v_antes, 'despues', round(p_monto, 2), 'desde', p_desde));
end $$;

alter table public.nomina_semanal
  add column if not exists base_nib numeric(12,2) not null default 0, add column if not exists nib_empleado numeric(12,2) not null default 0,
  add column if not exists nib_empleador numeric(12,2) not null default 0, add column if not exists base_nhip numeric(12,2) not null default 0,
  add column if not exists nhip_empleado numeric(12,2) not null default 0, add column if not exists nhip_empleador numeric(12,2) not null default 0;

-- La versión anterior se conserva renombrada (no se borra nada).
alter function public._calcular_semana(uuid) rename to _calcular_semana_v1_seguro;
create function public._calcular_semana(p_semana uuid)
returns table(perfil_id uuid, minutos_reg integer, minutos_extra integer, bruto numeric, seguro_pct numeric, seguro numeric, prestamo numeric, neto numeric,
              con_aprobacion_admin boolean, sin_tarifa boolean, base_nib numeric, nib_empleado numeric, nib_empleador numeric,
              base_nhip numeric, nhip_empleado numeric, nhip_empleador numeric)
language sql stable security definer set search_path to 'public' as $$
  with sem as (
    select s.*, (s.fin + 2) as pago, public.tasa_vigente(s.empresa_id, 'NIB', s.fin + 2) as nib, public.tasa_vigente(s.empresa_id, 'NHIP', s.fin + 2) as nhip
    from semanas s where s.id = p_semana
  ),
  horas as (
    select t.perfil_id, sum(t.min_reg)::integer as reg, sum(t.min_extra)::integer as extra,
           round(sum((t.min_reg + t.min_extra) * coalesce(t.tarifa, 0) / 60.0), 2) as bruto,
           bool_or(t.aprobado_admin) as con_admin, bool_or(t.tarifa is null) as sin_tarifa
    from public._turnos_semana(p_semana) t group by t.perfil_id
  ),
  previo as (
    select n.perfil_id, sum(n.bruto) as bruto_mes
    from nomina_semanal n join semanas s2 on s2.id = n.semana_id cross join sem
    where s2.empresa_id = sem.empresa_id and s2.id <> sem.id and s2.fin < sem.fin and s2.estado in ('cerrada', 'pagada') and not n.anulada
      and date_trunc('month', s2.fin + 2) = date_trunc('month', sem.pago)
    group by n.perfil_id
  ),
  pres as (
    select p.perfil_id, sum(d.monto) as monto from descuentos_prestamo d join prestamos p on p.id = d.prestamo_id where d.semana_id = p_semana group by p.perfil_id
  ),
  bases as (
    select h.*, coalesce(pr.monto, 0) as prest, coalesce(pv.bruto_mes, 0) as antes, sem.nib, sem.nhip
    from horas h cross join sem left join pres pr on pr.perfil_id = h.perfil_id left join previo pv on pv.perfil_id = h.perfil_id
  ),
  topes as (
    select b.*,
      greatest(least(b.antes + b.bruto, coalesce((b.nib).tope_mensual, 0)) - least(b.antes, coalesce((b.nib).tope_mensual, 0)), 0) as b_nib,
      greatest(least(b.antes + b.bruto, coalesce((b.nhip).tope_mensual, 0)) - least(b.antes, coalesce((b.nhip).tope_mensual, 0)), 0) as b_nhip
    from bases b
  ),
  calc as (
    select t.*, round(t.b_nib * coalesce((t.nib).tasa_empleado, 0) / 100, 2) as nib_e, round(t.b_nib * coalesce((t.nib).tasa_empleador, 0) / 100, 2) as nib_p,
      round(t.b_nhip * coalesce((t.nhip).tasa_empleado, 0) / 100, 2) as nhip_e, round(t.b_nhip * coalesce((t.nhip).tasa_empleador, 0) / 100, 2) as nhip_p
    from topes t
  )
  select c.perfil_id, c.reg, c.extra, c.bruto, 0::numeric, c.nib_e + c.nhip_e, c.prest, c.bruto - c.nib_e - c.nhip_e - c.prest, c.con_admin, c.sin_tarifa,
         c.b_nib, c.nib_e, c.nib_p, c.b_nhip, c.nhip_e, c.nhip_p
  from calc c
$$;
revoke all on function public._calcular_semana(uuid) from public, anon, authenticated;

create or replace function public._cerrar_semana(p_semana uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare s semanas; c record; d record; v_falta numeric; v_ids uuid[];
begin
  select * into s from semanas where id = p_semana for update;
  if not found or s.estado <> 'abierta' then return; end if;
  for c in select * from public._calcular_semana(p_semana) where neto < 0 loop
    v_falta := -c.neto;
    for d in select dp.* from descuentos_prestamo dp join prestamos p on p.id = dp.prestamo_id where dp.semana_id = p_semana and p.perfil_id = c.perfil_id order by dp.creado_en desc loop
      exit when v_falta <= 0;
      update descuentos_prestamo set monto = monto - least(monto, v_falta) where id = d.id;
      v_falta := v_falta - least(d.monto, v_falta);
    end loop;
    perform public._evento(s.empresa_id, 'descuento_ajustado_al_cierre', jsonb_build_object('semana', p_semana, 'perfil', c.perfil_id, 'ajuste', -c.neto));
  end loop;
  select array_agg(turno_id) into v_ids from public._turnos_semana(p_semana);
  insert into nomina_proyecto (semana_id, empresa_id, perfil_id, proyecto_id, minutos_reg, minutos_extra, bruto, anulada)
  select p_semana, s.empresa_id, perfil_id, proyecto_id, minutos_reg, minutos_extra, round(bruto_exacto, 2), false from public._detalle_semana(p_semana)
  on conflict (semana_id, perfil_id, proyecto_id) do update set minutos_reg = excluded.minutos_reg, minutos_extra = excluded.minutos_extra, bruto = excluded.bruto, anulada = false;
  insert into nomina_semanal (semana_id, empresa_id, perfil_id, minutos_reg, minutos_extra, bruto, seguro_pct, seguro, prestamo, neto, con_aprobacion_admin, anulada,
                              base_nib, nib_empleado, nib_empleador, base_nhip, nhip_empleado, nhip_empleador)
  select p_semana, s.empresa_id, perfil_id, minutos_reg, minutos_extra, bruto, seguro_pct, seguro, prestamo, neto, con_aprobacion_admin, false,
         base_nib, nib_empleado, nib_empleador, base_nhip, nhip_empleado, nhip_empleador
  from public._calcular_semana(p_semana)
  on conflict (semana_id, perfil_id) do update
    set minutos_reg = excluded.minutos_reg, minutos_extra = excluded.minutos_extra, bruto = excluded.bruto, seguro_pct = excluded.seguro_pct, seguro = excluded.seguro,
        prestamo = excluded.prestamo, neto = excluded.neto, con_aprobacion_admin = excluded.con_aprobacion_admin, anulada = false,
        base_nib = excluded.base_nib, nib_empleado = excluded.nib_empleado, nib_empleador = excluded.nib_empleador,
        base_nhip = excluded.base_nhip, nhip_empleado = excluded.nhip_empleado, nhip_empleador = excluded.nhip_empleador;
  update turnos set semana_id = p_semana where id = any (coalesce(v_ids, '{}'));
  update semanas set estado = 'cerrada', cerrada_en = now(), reabierta = false where id = p_semana;
  perform public.asegurar_semana(s.empresa_id, s.fin + 1);
  perform public._evento(s.empresa_id, 'semana_cerrada', jsonb_build_object('semana', p_semana));
end $$;
revoke all on function public._cerrar_semana(uuid) from public, anon, authenticated;

create or replace function public.nomina_semana_estatutario(p_semana uuid)
returns table(perfil_id uuid, nombre text, bruto numeric, base_nib numeric, nib_empleado numeric, nib_empleador numeric, base_nhip numeric, nhip_empleado numeric, nhip_empleador numeric, estado_semana text)
language plpgsql stable security definer set search_path to 'public' as $$
declare s semanas; v_todos boolean := public.es_gerencia();
begin
  select * into s from semanas where id = p_semana and empresa_id = public.mi_empresa();
  if not found then raise exception 'Semana no encontrada'; end if;
  if s.estado = 'abierta' then
    return query select c.perfil_id, p.nombre, c.bruto, c.base_nib, c.nib_empleado, c.nib_empleador, c.base_nhip, c.nhip_empleado, c.nhip_empleador, s.estado
      from public._calcular_semana(p_semana) c join perfiles p on p.id = c.perfil_id where v_todos or c.perfil_id = auth.uid() order by p.nombre;
  else
    return query select n.perfil_id, p.nombre, n.bruto, n.base_nib, n.nib_empleado, n.nib_empleador, n.base_nhip, n.nhip_empleado, n.nhip_empleador, s.estado
      from nomina_semanal n join perfiles p on p.id = n.perfil_id where n.semana_id = p_semana and not n.anulada and (v_todos or n.perfil_id = auth.uid()) order by p.nombre;
  end if;
end $$;

create or replace function public.reporte_remesa(p_anio integer, p_mes integer)
returns table(perfil_id uuid, nombre text, numero_nib text, numero_nhip text, base_nib numeric, nib_empleado numeric, nib_empleador numeric, nib_total numeric,
              base_nhip numeric, nhip_empleado numeric, nhip_empleador numeric, nhip_total numeric, vence_nib date, vence_nhip date)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_emp uuid := public.mi_empresa(); v_mes date := make_date(p_anio, p_mes, 1); v_sig date := (make_date(p_anio, p_mes, 1) + interval '1 month')::date; v_dia_nib integer; v_dia_nhip integer;
begin
  if not public.es_gerencia() then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  v_dia_nib := coalesce((public.tasa_vigente(v_emp, 'NIB', v_sig)).dia_vencimiento, 15);
  v_dia_nhip := coalesce((public.tasa_vigente(v_emp, 'NHIP', v_sig)).dia_vencimiento, 14);
  return query
    select n.perfil_id, p.nombre, p.numero_nib, p.numero_nhip, sum(n.base_nib), sum(n.nib_empleado), sum(n.nib_empleador), sum(n.nib_empleado + n.nib_empleador),
           sum(n.base_nhip), sum(n.nhip_empleado), sum(n.nhip_empleador), sum(n.nhip_empleado + n.nhip_empleador),
           make_date(extract(year from v_sig)::int, extract(month from v_sig)::int, v_dia_nib), make_date(extract(year from v_sig)::int, extract(month from v_sig)::int, v_dia_nhip)
    from nomina_semanal n join semanas s on s.id = n.semana_id join perfiles p on p.id = n.perfil_id
    where s.empresa_id = v_emp and s.estado in ('cerrada', 'pagada') and not n.anulada and date_trunc('month', s.fin + 2) = v_mes
    group by n.perfil_id, p.nombre, p.numero_nib, p.numero_nhip order by p.nombre;
end $$;

create or replace function public.pendientes_registro_nhip()
returns table(perfil_id uuid, nombre text, permiso_trabajo_aprobado date, semanas integer, nhip_acumulado numeric)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.es_gerencia() then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  return query
    select p.id, p.nombre, p.permiso_trabajo_aprobado, coalesce(x.semanas, 0)::integer, coalesce(x.acumulado, 0)
    from perfiles p
    left join lateral (
      select count(*) as semanas, sum(n.nhip_empleado + n.nhip_empleador) as acumulado
      from nomina_semanal n join semanas s on s.id = n.semana_id
      where n.perfil_id = p.id and not n.anulada and s.estado in ('cerrada', 'pagada') and s.fin >= p.permiso_trabajo_aprobado
    ) x on true
    where p.empresa_id = public.mi_empresa() and p.activo and p.permiso_trabajo_aprobado is not null and p.numero_nhip is null
    order by p.permiso_trabajo_aprobado;
end $$;

-- Aviso a los admin 3 días antes de cada vencimiento (lo llama el cron de Supabase).
create or replace function public.avisar_remesas(p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path to 'public' as $$
declare e record; a text; t tasas_estatutarias; v_hoy date; v_vence date; v_mes date; v_total numeric; n integer := 0;
begin
  for e in select id, zona_horaria from empresas loop
    v_hoy := (p_ahora at time zone e.zona_horaria)::date;
    foreach a in array array['NIB', 'NHIP'] loop
      t := public.tasa_vigente(e.id, a, v_hoy);
      continue when t.id is null;
      v_vence := make_date(extract(year from v_hoy)::int, extract(month from v_hoy)::int, t.dia_vencimiento);
      continue when v_hoy <> v_vence - 3;
      v_mes := (date_trunc('month', v_hoy) - interval '1 month')::date;
      select coalesce(sum(case when a = 'NIB' then x.nib_empleado + x.nib_empleador else x.nhip_empleado + x.nhip_empleador end), 0) into v_total
        from nomina_semanal x join semanas s on s.id = x.semana_id
       where s.empresa_id = e.id and s.estado in ('cerrada', 'pagada') and not x.anulada and date_trunc('month', s.fin + 2) = v_mes;
      insert into notificaciones (empresa_id, perfil_id, tipo, datos)
      select e.id, p.id, 'remesa_por_vencer', jsonb_build_object('agencia', a, 'vence', v_vence, 'mes', to_char(v_mes, 'YYYY-MM'), 'total', v_total)
      from perfiles p where p.empresa_id = e.id and p.activo and 'admin' = any (p.roles);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public._sembrar_tasas(uuid) from public, anon, authenticated;
revoke all on function public._tr_empresa_sembrar_tasas() from public, anon, authenticated;
revoke all on function public.tasa_vigente(uuid, text, date) from public, anon, authenticated;
revoke all on function public.avisar_remesas(timestamptz) from public, anon, authenticated;
revoke all on function public.cambiar_tasa_estatutaria(text, date, numeric, numeric, numeric, integer) from public, anon;
revoke all on function public.actualizar_datos_estatutarios(uuid, text, text, date) from public, anon;
revoke all on function public.nomina_semana_estatutario(uuid) from public, anon;
revoke all on function public.reporte_remesa(integer, integer) from public, anon;
revoke all on function public.pendientes_registro_nhip() from public, anon;
revoke all on function public.cambiar_tarifa(uuid, numeric, date) from public, anon;
grant execute on function public.cambiar_tasa_estatutaria(text, date, numeric, numeric, numeric, integer) to authenticated;
grant execute on function public.actualizar_datos_estatutarios(uuid, text, text, date) to authenticated;
grant execute on function public.nomina_semana_estatutario(uuid) to authenticated;
grant execute on function public.reporte_remesa(integer, integer) to authenticated;
grant execute on function public.pendientes_registro_nhip() to authenticated;
grant execute on function public.cambiar_tarifa(uuid, numeric, date) to authenticated;
