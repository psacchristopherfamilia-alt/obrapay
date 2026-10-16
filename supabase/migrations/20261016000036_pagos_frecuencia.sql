-- ObraPay · Fase E: pagos semanales, quincenales o mensuales por compañía.
--   semanal   = como hoy (el día de inicio lo elige la compañía)
--   quincenal = del 1 al 15 y del 16 al último día del mes
--   mensual   = mes calendario
-- Cambiar la frecuencia solo afecta a los periodos que se abran después: el periodo abierto termina como estaba y los cerrados o pagados no cambian.
-- La tabla sigue llamándose "semanas" (es el contenedor de cada periodo de pago).

alter table public.empresas
  add column if not exists pago_frecuencia text not null default 'semanal' check (pago_frecuencia in ('semanal', 'quincenal', 'mensual'));

-- Un periodo ya no dura siempre 7 días.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.semanas'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%inicio + 6%'
  loop
    execute format('alter table public.semanas drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.semanas drop constraint if exists semanas_rango;
alter table public.semanas add constraint semanas_rango check (fin >= inicio);

-- Periodo que le toca a una fecha. Si ya existe un periodo que la contiene, ese; si no, el natural según la frecuencia,
-- recortado para no pisar periodos vecinos (así un cambio de frecuencia a mitad de mes no solapa nada).
create or replace function public.periodo_de(p_empresa uuid, p_fecha date, out inicio date, out fin date)
language plpgsql stable security definer set search_path = public as $fn$
declare v_frec text; v_dia int; v_prev date; v_next date;
begin
  select s.inicio, s.fin into inicio, fin from semanas s
   where s.empresa_id = p_empresa and s.inicio <= p_fecha and s.fin >= p_fecha order by s.inicio desc limit 1;
  if found then return; end if;
  select coalesce(e.pago_frecuencia, 'semanal'), coalesce(e.semana_inicio_dia, 4) into v_frec, v_dia from empresas e where e.id = p_empresa;
  v_frec := coalesce(v_frec, 'semanal'); v_dia := coalesce(v_dia, 4);
  if v_frec = 'quincenal' then
    inicio := date_trunc('month', p_fecha)::date + case when extract(day from p_fecha) <= 15 then 0 else 15 end;
    fin := case when extract(day from p_fecha) <= 15 then inicio + 14 else (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date end;
  elsif v_frec = 'mensual' then
    inicio := date_trunc('month', p_fecha)::date;
    fin := (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date;
  else
    inicio := p_fecha - ((extract(isodow from p_fecha)::int - v_dia + 7) % 7);
    fin := inicio + 6;
  end if;
  select max(s.fin) into v_prev from semanas s where s.empresa_id = p_empresa and s.fin < p_fecha;
  if v_prev is not null and v_prev >= inicio then inicio := v_prev + 1; end if;
  select min(s.inicio) into v_next from semanas s where s.empresa_id = p_empresa and s.inicio > p_fecha;
  if v_next is not null and v_next <= fin then fin := v_next - 1; end if;
end $fn$;
revoke all on function public.periodo_de(uuid, date) from public, anon;
grant execute on function public.periodo_de(uuid, date) to authenticated;

-- Todo lo que busca "la semana de una fecha" por su inicio sigue funcionando: ahora devuelve el inicio del periodo.
create or replace function public.semana_inicio_de(p_fecha date, p_empresa uuid) returns date
language sql stable security definer set search_path = public as $fn$
  select (public.periodo_de(p_empresa, p_fecha)).inicio
$fn$;
revoke all on function public.semana_inicio_de(date, uuid) from public, anon;
grant execute on function public.semana_inicio_de(date, uuid) to authenticated;

create or replace function public.asegurar_semana(p_empresa uuid, p_fecha date)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_ini date; v_fin date; v_id uuid;
begin
  select p.inicio, p.fin into v_ini, v_fin from public.periodo_de(p_empresa, p_fecha) p;
  select id into v_id from semanas where empresa_id = p_empresa and inicio = v_ini;
  if v_id is null then
    insert into semanas (empresa_id, inicio, fin)
    values (p_empresa, v_ini, v_fin)
    on conflict (empresa_id, inicio) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from semanas where empresa_id = p_empresa and inicio = v_ini;
    end if;
  end if;
  return v_id;
end $fn$;

-- Número del periodo dentro del mes de pago: semanal 1-5 por día de pago; quincenal 1 o 2; mensual 1.
create or replace function public._nro_periodo(p_inicio date, p_fin date, p_pago date) returns integer
language sql immutable as $fn$
  select case
    when p_fin - p_inicio + 1 >= 28 then 1
    when p_fin - p_inicio + 1 between 13 and 16 then case when extract(day from p_inicio) <= 15 then 1 else 2 end
    else ((extract(day from p_pago)::int - 1) / 7 + 1)::int
  end
$fn$;

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
           public._nro_periodo(s.inicio, s.fin, s.pago)
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
    select s.id, s.inicio, s.fin, s.pago, public._nro_periodo(s.inicio, s.fin, s.pago), p.id,
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
    select s.id, s.inicio, s.fin, s.pago, public._nro_periodo(s.inicio, s.fin, s.pago),
           pr.id, pr.nombre::text, p.id, p.nombre::text, np.minutos_reg, np.minutos_extra, np.bruto
    from nomina_proyecto np
    join semanas s on s.id = np.semana_id
    join proyectos pr on pr.id = np.proyecto_id
    join perfiles p on p.id = np.perfil_id
    where s.empresa_id = p_empresa and np.empresa_id = p_empresa and s.estado in ('cerrada', 'pagada') and not np.anulada
      and s.pago between p_desde and p_hasta
    order by pr.nombre, s.inicio, p.nombre;
end $function$;

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
    'zona_horaria', e.zona_horaria, 'semana_inicio_dia', e.semana_inicio_dia, 'pago_dias_despues', e.pago_dias_despues, 'pago_frecuencia', e.pago_frecuencia,
    'marca_nombre', e.marca_nombre, 'marca_color', e.marca_color, 'marca_logo', e.marca_logo);
end $$;

create or replace function public.plataforma_guardar_config(p_empresa uuid, p_cambios jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas; v_mult numeric; v_desde date; v_ini time; v_fin time; v_ext time; v_cie time; v_zona text; v_color text; v_logo text; v_nom text;
        v_abierta date; v_reg jsonb := '{}'::jsonb; v_dia int; v_pdias int; v_frec text;
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
  -- La frecuencia solo vale para los periodos que se abran después: el periodo abierto y los cerrados no cambian.
  v_frec := case when p_cambios ? 'pago_frecuencia' then p_cambios ->> 'pago_frecuencia' else e.pago_frecuencia end;
  if v_frec is null or v_frec not in ('semanal', 'quincenal', 'mensual') then raise exception 'La frecuencia de pago no es válida'; end if;
  if v_frec <> e.pago_frecuencia then v_reg := v_reg || jsonb_build_object('pago_frecuencia', jsonb_build_array(e.pago_frecuencia, v_frec)); end if;

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
         almuerzo_inicio = v_ini, almuerzo_fin = v_fin, zona_horaria = v_zona, semana_inicio_dia = v_dia, pago_dias_despues = v_pdias, pago_frecuencia = v_frec, marca_nombre = v_nom, marca_color = v_color, marca_logo = v_logo
   where id = p_empresa;
  if v_pdias <> e.pago_dias_despues then update semanas set pago = fin + v_pdias where empresa_id = p_empresa and estado = 'abierta'; end if;
  if v_reg <> '{}'::jsonb then perform public._evento(p_empresa, 'config_cambiada', jsonb_build_object('cambios', v_reg)); end if;
end $$;

revoke all on function public.plataforma_config(uuid), public.plataforma_guardar_config(uuid, jsonb) from public, anon;
grant execute on function public.plataforma_config(uuid), public.plataforma_guardar_config(uuid, jsonb) to authenticated;

-- El administrador de la compañía también puede cambiar la frecuencia (solo vale para los periodos que se abran después).
create or replace function public.cambiar_frecuencia_pago(p_frecuencia text) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_emp uuid := public.mi_empresa(); v_ant text;
begin
  if not public.tengo_rol('admin') then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  if p_frecuencia is null or p_frecuencia not in ('semanal', 'quincenal', 'mensual') then raise exception 'La frecuencia de pago no es válida'; end if;
  select pago_frecuencia into v_ant from empresas where id = v_emp for update;
  if v_ant is distinct from p_frecuencia then
    update empresas set pago_frecuencia = p_frecuencia where id = v_emp;
    perform public._evento(v_emp, 'config_cambiada', jsonb_build_object('cambios', jsonb_build_object('pago_frecuencia', jsonb_build_array(v_ant, p_frecuencia))));
  end if;
end $fn$;
revoke all on function public.cambiar_frecuencia_pago(text) from public, anon;
grant execute on function public.cambiar_frecuencia_pago(text) to authenticated;
