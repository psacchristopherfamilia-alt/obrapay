-- ObraPay · Fase B (2): calendario de pago configurable por compañía (día de inicio de semana y días hasta el pago).
-- Todo sigue igual por defecto: semana de jueves a miércoles, pago 2 días después (viernes). Las semanas ya cerradas guardan su fecha de pago.

alter table public.empresas
  add column if not exists semana_inicio_dia smallint not null default 4 check (semana_inicio_dia between 1 and 7),
  add column if not exists pago_dias_despues smallint not null default 2 check (pago_dias_despues between 0 and 13);

alter table public.semanas add column if not exists pago date;
update public.semanas set pago = fin + 2 where pago is null;
alter table public.semanas alter column pago set not null;
alter table public.semanas drop constraint if exists semanas_inicio_check;

create or replace function public._semana_pago() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.pago is null then
    new.pago := new.fin + coalesce((select pago_dias_despues from empresas where id = new.empresa_id), 2);
  end if;
  return new;
end $fn$;
drop trigger if exists semanas_pago on public.semanas;
create trigger semanas_pago before insert on public.semanas for each row execute function public._semana_pago();
revoke all on function public._semana_pago() from public, anon, authenticated;

-- Inicio de la semana según el día que usa la compañía (la versión de un solo argumento sigue siendo jueves).
create or replace function public.semana_inicio_de(p_fecha date, p_empresa uuid) returns date
language sql stable security definer set search_path = public as $fn$
  select p_fecha - ((extract(isodow from p_fecha)::int - coalesce((select semana_inicio_dia from empresas where id = p_empresa), 4) + 7) % 7)
$fn$;
revoke all on function public.semana_inicio_de(date, uuid) from public, anon;
grant execute on function public.semana_inicio_de(date, uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.asegurar_semana(p_empresa uuid, p_fecha date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inicio date := public.semana_inicio_de(p_fecha, p_empresa);
  v_id uuid;
begin
  select id into v_id from semanas where empresa_id = p_empresa and inicio = v_inicio;
  if v_id is null then
    insert into semanas (empresa_id, inicio, fin)
    values (p_empresa, v_inicio, v_inicio + 6)
    on conflict (empresa_id, inicio) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from semanas where empresa_id = p_empresa and inicio = v_inicio;
    end if;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.corregir_turno(p_id uuid, p_entrada timestamp with time zone, p_salida timestamp with time zone, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t turnos;
  v_estado text;
  v_tz text;
  v_sem semanas;
begin
  select * into t from turnos where id = p_id and (empresa_id = public.mi_empresa() or public.supervisa_proyecto(proyecto_id)) for update;
  if not found then raise exception 'Turno no encontrado'; end if;
  if coalesce(length(trim(p_motivo)), 0) = 0 then raise exception 'Escribe el motivo de la corrección'; end if;
  if p_salida is null or p_salida <= p_entrada then raise exception 'La salida debe ser después de la entrada'; end if;
  if t.semana_id is not null then
    raise exception 'La semana ya está cerrada; el admin debe reabrirla';
  end if;
  if t.perfil_id = auth.uid() then raise exception 'No puedes corregir tu propio turno'; end if;
  if public.supervisa_proyecto(t.proyecto_id) then
    v_estado := 'aprobado';
  elsif public.tengo_rol('admin') then
    v_estado := 'aprobado_admin';
  else
    raise exception 'No puedes corregir turnos de este proyecto' using errcode = '42501';
  end if;

  -- Un trabajador no puede estar en dos turnos a la vez, ni siquiera en las dos compañías.
  if exists (select 1 from turnos o where o.perfil_id = t.perfil_id and o.id <> t.id
             and tstzrange(o.entrada, coalesce(o.salida, 'infinity'::timestamptz), '[)') && tstzrange(p_entrada, p_salida, '[)')) then
    raise exception 'Ese horario se cruza con otro turno del mismo trabajador (en otro proyecto o en la otra compañía)';
  end if;

  select zona_horaria into v_tz from empresas where id = t.empresa_id;
  select * into v_sem from semanas
   where empresa_id = t.empresa_id and inicio = public.semana_inicio_de((p_entrada at time zone v_tz)::date, t.empresa_id);
  if found and v_sem.estado <> 'abierta' then
    raise exception 'La nueva fecha cae en una semana cerrada';
  end if;

  if t.entrada is distinct from p_entrada then
    insert into turno_cambios (empresa_id, turno_id, campo, antes, despues, motivo, por)
    values (t.empresa_id, t.id, 'entrada', t.entrada::text, p_entrada::text, p_motivo, auth.uid());
  end if;
  if t.salida is distinct from p_salida then
    insert into turno_cambios (empresa_id, turno_id, campo, antes, despues, motivo, por)
    values (t.empresa_id, t.id, 'salida', coalesce(t.salida::text, '(sin salida)'), p_salida::text, p_motivo, auth.uid());
  end if;

  update turnos
     set entrada = p_entrada, salida = p_salida, corregido = true,
         estado = v_estado, aprobado_por = auth.uid(), aprobado_en = now()
   where id = t.id;
end $function$;

CREATE OR REPLACE FUNCTION public.reporte_mensual(p_anio integer, p_mes integer)
 RETURNS TABLE(perfil_id uuid, nombre text, semanas integer, minutos_reg integer, minutos_extra integer, bruto numeric, seguro numeric, prestamo numeric, neto numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.tengo_rol('admin') or public.tengo_rol('dueno')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  return query
    select n.perfil_id, p.nombre, count(*)::integer,
           sum(n.minutos_reg)::integer, sum(n.minutos_extra)::integer,
           sum(n.bruto), sum(n.seguro), sum(n.prestamo), sum(n.neto)
    from nomina_semanal n
    join semanas s on s.id = n.semana_id
    join perfiles p on p.id = n.perfil_id
    where s.empresa_id = public.mi_empresa()
      and s.estado in ('cerrada', 'pagada') and not n.anulada
      and extract(year from s.pago) = p_anio and extract(month from s.pago) = p_mes
    group by n.perfil_id, p.nombre
    order by p.nombre;
end $function$;

CREATE OR REPLACE FUNCTION public.reporte_mensual_proyectos(p_anio integer, p_mes integer)
 RETURNS TABLE(proyecto_id uuid, proyecto text, minutos_reg integer, minutos_extra integer, bruto numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.tengo_rol('admin') or public.tengo_rol('dueno')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  return query
    select n.proyecto_id, pr.nombre, sum(n.minutos_reg)::integer, sum(n.minutos_extra)::integer, sum(n.bruto)
    from nomina_proyecto n
    join semanas s on s.id = n.semana_id
    join proyectos pr on pr.id = n.proyecto_id
    where s.empresa_id = public.mi_empresa()
      and s.estado in ('cerrada', 'pagada') and not n.anulada
      and extract(year from s.pago) = p_anio and extract(month from s.pago) = p_mes
    group by n.proyecto_id, pr.nombre
    order by pr.nombre;
end $function$;

CREATE OR REPLACE FUNCTION public.reporte_remesa(p_anio integer, p_mes integer)
 RETURNS TABLE(perfil_id uuid, nombre text, numero_nib text, numero_nhip text, base_nib numeric, nib_empleado numeric, nib_empleador numeric, nib_total numeric, base_nhip numeric, nhip_empleado numeric, nhip_empleador numeric, nhip_total numeric, vence_nib date, vence_nhip date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    where s.empresa_id = v_emp and s.estado in ('cerrada', 'pagada') and not n.anulada and date_trunc('month', s.pago) = v_mes
    group by n.perfil_id, p.nombre, p.numero_nib, p.numero_nhip order by p.nombre;
end $function$;

CREATE OR REPLACE FUNCTION public.avisar_remesas(p_ahora timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record; a text; t tasas_estatutarias; v_hoy date; v_vence date; v_mes date; v_total numeric; v_dias integer; n integer := 0;
begin
  for e in select id, zona_horaria from empresas loop
    v_hoy := (p_ahora at time zone e.zona_horaria)::date;
    foreach a in array array['NIB', 'NHIP'] loop
      t := public.tasa_vigente(e.id, a, v_hoy);
      continue when t.id is null;
      v_vence := make_date(extract(year from v_hoy)::int, extract(month from v_hoy)::int, t.dia_vencimiento);
      v_dias := v_vence - v_hoy;
      continue when v_dias not in (3, 0);
      v_mes := (date_trunc('month', v_hoy) - interval '1 month')::date;
      select coalesce(sum(case when a = 'NIB' then x.nib_empleado + x.nib_empleador else x.nhip_empleado + x.nhip_empleador end), 0) into v_total
        from nomina_semanal x join semanas s on s.id = x.semana_id
       where s.empresa_id = e.id and s.estado in ('cerrada', 'pagada') and not x.anulada and date_trunc('month', s.pago) = v_mes;
      insert into notificaciones (empresa_id, perfil_id, tipo, datos)
      select e.id, p.id, 'remesa_por_vencer', jsonb_build_object('agencia', a, 'vence', v_vence, 'mes', to_char(v_mes, 'YYYY-MM'), 'total', v_total, 'dias', v_dias)
      from perfiles p where public.es_miembro(p.id, e.id) and p.activo and 'admin' = any (p.roles);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.resumen_empresas(p_desde date, p_hasta date)
 RETURNS TABLE(empresa_id uuid, empresa text, proyecto_id uuid, proyecto text, concepto text, monto numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.es_gerencia() then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Rango de fechas no válido'; end if;
  return query
    with mis as (select m.empresa_id as emp from perfil_empresas m where m.perfil_id = auth.uid() and m.baja_en is null),
    sem as (
      select s.id, s.empresa_id from semanas s
      where s.empresa_id in (select emp from mis) and s.estado in ('cerrada', 'pagada')
        and (s.pago) between p_desde and p_hasta
    )
    select e.id, e.nombre::text, np.proyecto_id, pr.nombre::text, 'mano_obra'::text, sum(np.bruto)
      from nomina_proyecto np join sem on sem.id = np.semana_id
      join empresas e on e.id = np.empresa_id join proyectos pr on pr.id = np.proyecto_id
     where not np.anulada group by e.id, e.nombre, np.proyecto_id, pr.nombre
    union all
    select e.id, e.nombre::text, null::uuid, null::text, 'nib_empleador'::text, sum(ns.nib_empleador)
      from nomina_semanal ns join sem on sem.id = ns.semana_id join empresas e on e.id = ns.empresa_id
     where not ns.anulada group by e.id, e.nombre
    union all
    select e.id, e.nombre::text, null::uuid, null::text, 'nhip_empleador'::text, sum(ns.nhip_empleador)
      from nomina_semanal ns join sem on sem.id = ns.semana_id join empresas e on e.id = ns.empresa_id
     where not ns.anulada group by e.id, e.nombre
    union all
    select e.id, e.nombre::text, g.proyecto_id, pr.nombre::text, g.categoria::text, sum(g.monto)
      from gastos g join empresas e on e.id = g.empresa_id left join proyectos pr on pr.id = g.proyecto_id
     where g.empresa_id in (select emp from mis) and not g.anulado and g.fecha between p_desde and p_hasta
     group by e.id, e.nombre, g.proyecto_id, pr.nombre, g.categoria;
end $function$;

CREATE OR REPLACE FUNCTION public.reporte_semanas(p_empresa uuid)
 RETURNS TABLE(semana_id uuid, inicio date, fin date, estado text, pago date, anio integer, mes integer, nro integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._exigir_reporte(p_empresa);
  return query
    select s.id, s.inicio, s.fin, s.estado, s.pago, extract(year from s.pago)::int, extract(month from s.pago)::int,
           ((extract(day from s.pago)::int - 1) / 7 + 1)::int
    from semanas s where s.empresa_id = p_empresa order by s.inicio desc limit 156;
end $function$;

CREATE OR REPLACE FUNCTION public.reporte_seguros(p_empresa uuid, p_desde date, p_hasta date)
 RETURNS TABLE(semana_id uuid, inicio date, fin date, pago date, nro integer, perfil_id uuid, apellido text, nombre text, inicial text, nombre_completo text, numero_nib text, numero_nhip text, bruto numeric, base_nib numeric, nib_empleado numeric, nib_empleador numeric, base_nhip numeric, nhip_empleado numeric, nhip_empleador numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._exigir_reporte(p_empresa);
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Rango de fechas no válido'; end if;
  return query
    select s.id, s.inicio, s.fin, s.pago, ((extract(day from s.pago)::int - 1) / 7 + 1)::int, p.id,
           (public._nombre_legal(p.nombre, p.apellido_legal, p.nombre_legal))[1],
           (public._nombre_legal(p.nombre, p.apellido_legal, p.nombre_legal))[2],
           nullif(btrim(p.inicial_legal), ''), p.nombre::text, p.numero_nib, p.numero_nhip,
           n.bruto, n.base_nib, n.nib_empleado, n.nib_empleador, n.base_nhip, n.nhip_empleado, n.nhip_empleador
    from nomina_semanal n
    join semanas s on s.id = n.semana_id
    join perfiles p on p.id = n.perfil_id
    where s.empresa_id = p_empresa and n.empresa_id = p_empresa and s.estado in ('cerrada', 'pagada') and not n.anulada
      and s.pago between p_desde and p_hasta
    order by s.inicio, p.nombre;
end $function$;

CREATE OR REPLACE FUNCTION public.reporte_proyectos_pagados(p_empresa uuid, p_desde date, p_hasta date)
 RETURNS TABLE(semana_id uuid, inicio date, fin date, pago date, nro integer, proyecto_id uuid, proyecto text, perfil_id uuid, trabajador text, minutos_reg integer, minutos_extra integer, bruto numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._exigir_reporte(p_empresa);
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Rango de fechas no válido'; end if;
  return query
    select s.id, s.inicio, s.fin, s.pago, ((extract(day from s.pago)::int - 1) / 7 + 1)::int,
           pr.id, pr.nombre::text, p.id, p.nombre::text, np.minutos_reg, np.minutos_extra, np.bruto
    from nomina_proyecto np
    join semanas s on s.id = np.semana_id
    join proyectos pr on pr.id = np.proyecto_id
    join perfiles p on p.id = np.perfil_id
    where s.empresa_id = p_empresa and np.empresa_id = p_empresa and s.estado in ('cerrada', 'pagada') and not np.anulada
      and s.pago between p_desde and p_hasta
    order by pr.nombre, s.inicio, p.nombre;
end $function$;

create or replace function public._calcular_semana(p_semana uuid)
returns table(perfil_id uuid, minutos_reg integer, minutos_extra integer, bruto numeric, seguro_pct numeric, seguro numeric, prestamo numeric, neto numeric,
              con_aprobacion_admin boolean, sin_tarifa boolean, base_nib numeric, nib_empleado numeric, nib_empleador numeric,
              base_nhip numeric, nhip_empleado numeric, nhip_empleador numeric)
language sql stable security definer set search_path to 'public' as $$
  with sem as (
    select s.*, public.tasa_vigente(s.empresa_id, 'NIB', s.pago) as nib, public.tasa_vigente(s.empresa_id, 'NHIP', s.pago) as nhip
    from semanas s where s.id = p_semana
  ),
  horas as (
    select t.perfil_id, sum(t.min_reg)::integer as reg, sum(t.min_extra)::integer as extra,
           round(sum((t.min_reg + t.min_extra * public._mult_extra(p_semana)) * coalesce(t.tarifa, 0) / 60.0), 2) as bruto,
           bool_or(t.aprobado_admin) as con_admin, bool_or(t.tarifa is null) as sin_tarifa
    from public._turnos_semana(p_semana) t group by t.perfil_id
  ),
  previo as (
    select n.perfil_id, sum(n.bruto) as bruto_mes
    from nomina_semanal n join semanas s2 on s2.id = n.semana_id cross join sem
    where s2.empresa_id = sem.empresa_id and s2.id <> sem.id and s2.fin < sem.fin and s2.estado in ('cerrada', 'pagada') and not n.anulada
      and date_trunc('month', s2.pago) = date_trunc('month', sem.pago)
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


-- Configuración de una compañía (solo el dueño de la plataforma).
create or replace function public.plataforma_config(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e empresas;
begin
  perform public._exigir_plataforma();
  select * into e from empresas where id = p_empresa and not interna;
  if not found then raise exception 'Compañía no encontrada'; end if;
  return jsonb_build_object(
    'empresa_id', e.id, 'nombre', e.nombre,
    'extra_multiplicador', e.extra_multiplicador, 'extra_mult_desde', e.extra_mult_desde,
    'hora_extra_desde', to_char(e.hora_extra_desde, 'HH24:MI'), 'hora_cierre_turno', to_char(e.hora_cierre_turno, 'HH24:MI'),
    'almuerzo_inicio', to_char(e.almuerzo_inicio, 'HH24:MI'), 'almuerzo_fin', to_char(e.almuerzo_fin, 'HH24:MI'),
    'zona_horaria', e.zona_horaria, 'semana_inicio_dia', e.semana_inicio_dia, 'pago_dias_despues', e.pago_dias_despues,
    'marca_nombre', e.marca_nombre, 'marca_color', e.marca_color, 'marca_logo', e.marca_logo);
end $$;

-- Guarda solo las claves que vienen en p_cambios y deja constancia (quién, cuándo, valor anterior).
create or replace function public.plataforma_guardar_config(p_empresa uuid, p_cambios jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas; v_mult numeric; v_desde date; v_ini time; v_fin time; v_ext time; v_cie time; v_zona text; v_color text; v_logo text; v_nom text;
        v_abierta date; v_reg jsonb := '{}'::jsonb; v_dia int; v_pdias int;
begin
  perform public._exigir_plataforma();
  select * into e from empresas where id = p_empresa and not interna for update;
  if not found then raise exception 'Compañía no encontrada'; end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then raise exception 'No hay cambios'; end if;

  v_mult := case when p_cambios ? 'extra_multiplicador' then (p_cambios ->> 'extra_multiplicador')::numeric else e.extra_multiplicador end;
  v_desde := case when p_cambios ? 'extra_mult_desde' then nullif(p_cambios ->> 'extra_mult_desde', '')::date else e.extra_mult_desde end;
  if v_mult is null or v_mult < 1 or v_mult > 3 then raise exception 'El multiplicador de hora extra debe estar entre 1 y 3'; end if;
  if v_mult > 1 and v_desde is null then raise exception 'Indica desde qué fecha vale el multiplicador'; end if;
  if v_mult > 1 and (p_cambios ? 'extra_multiplicador' or p_cambios ? 'extra_mult_desde') then
    select max(fin) + 1 into v_abierta from semanas where empresa_id = p_empresa and estado in ('cerrada', 'pagada');
    if v_abierta is not null and v_desde < v_abierta then
      raise exception 'La fecha no puede tocar semanas ya cerradas o pagadas (puede empezar el %)', v_abierta;
    end if;
  end if;
  if v_mult is distinct from e.extra_multiplicador then v_reg := v_reg || jsonb_build_object('extra_multiplicador', jsonb_build_array(e.extra_multiplicador, v_mult)); end if;
  if v_desde is distinct from e.extra_mult_desde then v_reg := v_reg || jsonb_build_object('extra_mult_desde', jsonb_build_array(e.extra_mult_desde, v_desde)); end if;

  v_ext := case when p_cambios ? 'hora_extra_desde' then (p_cambios ->> 'hora_extra_desde')::time else e.hora_extra_desde end;
  v_cie := case when p_cambios ? 'hora_cierre_turno' then (p_cambios ->> 'hora_cierre_turno')::time else e.hora_cierre_turno end;
  v_ini := case when p_cambios ? 'almuerzo_inicio' then nullif(p_cambios ->> 'almuerzo_inicio', '')::time else e.almuerzo_inicio end;
  v_fin := case when p_cambios ? 'almuerzo_fin' then nullif(p_cambios ->> 'almuerzo_fin', '')::time else e.almuerzo_fin end;
  if v_ext is null or v_cie is null then raise exception 'Faltan las horas del turno'; end if;
  if (v_ini is null) <> (v_fin is null) then raise exception 'El almuerzo necesita hora de inicio y de fin (o ninguna)'; end if;
  if v_fin is not null and v_fin <= v_ini then raise exception 'El almuerzo termina antes de empezar'; end if;
  if v_ext is distinct from e.hora_extra_desde then v_reg := v_reg || jsonb_build_object('hora_extra_desde', jsonb_build_array(e.hora_extra_desde, v_ext)); end if;
  if v_cie is distinct from e.hora_cierre_turno then v_reg := v_reg || jsonb_build_object('hora_cierre_turno', jsonb_build_array(e.hora_cierre_turno, v_cie)); end if;
  if v_ini is distinct from e.almuerzo_inicio or v_fin is distinct from e.almuerzo_fin then
    v_reg := v_reg || jsonb_build_object('almuerzo', jsonb_build_array(concat_ws('-', e.almuerzo_inicio, e.almuerzo_fin), concat_ws('-', v_ini, v_fin)));
  end if;

  v_dia := case when p_cambios ? 'semana_inicio_dia' then (p_cambios ->> 'semana_inicio_dia')::int else e.semana_inicio_dia end;
  v_pdias := case when p_cambios ? 'pago_dias_despues' then (p_cambios ->> 'pago_dias_despues')::int else e.pago_dias_despues end;
  if v_dia is null or v_dia < 1 or v_dia > 7 then raise exception 'El día de inicio de la semana no es válido'; end if;
  if v_pdias is null or v_pdias < 0 or v_pdias > 13 then raise exception 'Los días hasta el pago deben estar entre 0 y 13'; end if;
  if v_dia <> e.semana_inicio_dia then
    if exists (select 1 from turnos where empresa_id = p_empresa) or exists (select 1 from semanas where empresa_id = p_empresa and estado <> 'abierta')
       or exists (select 1 from descuentos_prestamo where empresa_id = p_empresa) then
      raise exception 'El día de inicio de la semana solo se puede cambiar antes de que la compañía registre horas';
    end if;
    delete from semanas where empresa_id = p_empresa;
    v_reg := v_reg || jsonb_build_object('semana_inicio_dia', jsonb_build_array(e.semana_inicio_dia, v_dia));
  end if;
  if v_pdias <> e.pago_dias_despues then v_reg := v_reg || jsonb_build_object('pago_dias_despues', jsonb_build_array(e.pago_dias_despues, v_pdias)); end if;

  v_zona := case when p_cambios ? 'zona_horaria' then nullif(trim(p_cambios ->> 'zona_horaria'), '') else e.zona_horaria end;
  if v_zona is null or not exists (select 1 from pg_timezone_names where name = v_zona) then raise exception 'La zona horaria no es válida'; end if;
  if v_zona is distinct from e.zona_horaria then v_reg := v_reg || jsonb_build_object('zona_horaria', jsonb_build_array(e.zona_horaria, v_zona)); end if;

  v_nom := case when p_cambios ? 'marca_nombre' then nullif(trim(p_cambios ->> 'marca_nombre'), '') else e.marca_nombre end;
  v_color := case when p_cambios ? 'marca_color' then nullif(trim(p_cambios ->> 'marca_color'), '') else e.marca_color end;
  v_logo := case when p_cambios ? 'marca_logo' then nullif(p_cambios ->> 'marca_logo', '') else e.marca_logo end;
  if v_nom is distinct from e.marca_nombre then v_reg := v_reg || jsonb_build_object('marca_nombre', jsonb_build_array(e.marca_nombre, v_nom)); end if;
  if v_color is distinct from e.marca_color then v_reg := v_reg || jsonb_build_object('marca_color', jsonb_build_array(e.marca_color, v_color)); end if;
  if v_logo is distinct from e.marca_logo then v_reg := v_reg || jsonb_build_object('marca_logo', jsonb_build_array(case when e.marca_logo is null then 'sin logo' else 'logo' end, case when v_logo is null then 'sin logo' else 'logo' end)); end if;

  update empresas set extra_multiplicador = v_mult, extra_mult_desde = v_desde, hora_extra_desde = v_ext, hora_cierre_turno = v_cie,
         almuerzo_inicio = v_ini, almuerzo_fin = v_fin, zona_horaria = v_zona, semana_inicio_dia = v_dia, pago_dias_despues = v_pdias, marca_nombre = v_nom, marca_color = v_color, marca_logo = v_logo
   where id = p_empresa;
  if v_pdias <> e.pago_dias_despues then update semanas set pago = fin + v_pdias where empresa_id = p_empresa and estado = 'abierta'; end if;
  if v_reg <> '{}'::jsonb then perform public._evento(p_empresa, 'config_cambiada', jsonb_build_object('cambios', v_reg)); end if;
end $$;

revoke all on function public.plataforma_config(uuid), public.plataforma_guardar_config(uuid, jsonb) from public, anon;
grant execute on function public.plataforma_config(uuid), public.plataforma_guardar_config(uuid, jsonb) to authenticated;
