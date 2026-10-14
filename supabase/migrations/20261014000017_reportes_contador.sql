-- ObraPay · Reportes para el contador: formato del NIB (formulario INS.007: Partes A, B y C, semanas 1 a 5),
-- NHIP y "pagado por proyecto", siempre por compañía. Las funciones reciben la compañía a consultar y exigen que
-- quien llama sea admin o dueño de ESA compañía; nunca mezclan compañías.
--   Semana del mes = por su viernes de pago (fin + 2): días 1-7 → semana 1, 8-14 → 2, 15-21 → 3, 22-28 → 4, 29-31 → 5.
--   Solo cuentan semanas cerradas o pagadas y nómina no anulada.

alter table public.empresas
  add column if not exists nib_registro text, add column if not exists nib_seguro text,
  add column if not exists direccion text, add column if not exists apartado text, add column if not exists telefono text;
alter table public.perfiles
  add column if not exists apellido_legal text, add column if not exists nombre_legal text, add column if not exists inicial_legal text;

create or replace function public._exigir_reporte(p_empresa uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_empresa is null or not public.es_gerencia() or not public.es_miembro(auth.uid(), p_empresa) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
end $$;

-- Apellido y nombre como van en el formulario: lo guardado, o (si falta) la última palabra y el resto.
create or replace function public._nombre_legal(p_nombre text, p_apellido text, p_pila text) returns text[]
language sql immutable as $$
  select array[
    coalesce(nullif(btrim(p_apellido), ''), nullif(substring(btrim(p_nombre) from '([^ ]+)$'), '')),
    coalesce(nullif(btrim(p_pila), ''), nullif(btrim(regexp_replace(btrim(p_nombre), ' *[^ ]+$', '')), ''), btrim(p_nombre))
  ]
$$;

create or replace function public.datos_empleador(p_empresa uuid)
returns table (empresa_id uuid, nombre text, nib_registro text, nib_seguro text, direccion text, apartado text, telefono text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir_reporte(p_empresa);
  return query select e.id, e.nombre::text, e.nib_registro, e.nib_seguro, e.direccion, e.apartado, e.telefono from empresas e where e.id = p_empresa;
end $$;

create or replace function public.guardar_datos_empleador(
  p_empresa uuid, p_nib_registro text, p_nib_seguro text, p_direccion text, p_apartado text, p_telefono text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir_rol('admin');
  perform public._exigir_reporte(p_empresa);
  update empresas set nib_registro = nullif(btrim(p_nib_registro), ''), nib_seguro = nullif(btrim(p_nib_seguro), ''),
         direccion = nullif(btrim(p_direccion), ''), apartado = nullif(btrim(p_apartado), ''), telefono = nullif(btrim(p_telefono), '')
   where id = p_empresa;
end $$;

create or replace function public.actualizar_nombre_legal(p_perfil uuid, p_apellido text, p_nombre text, p_inicial text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir_rol('admin');
  if not public.es_miembro(p_perfil, public.mi_empresa()) then raise exception 'Trabajador no encontrado'; end if;
  update perfiles set apellido_legal = nullif(btrim(p_apellido), ''), nombre_legal = nullif(btrim(p_nombre), ''),
         inicial_legal = nullif(left(btrim(p_inicial), 1), '') where id = p_perfil;
end $$;

-- Semanas de la compañía para elegir en pantalla.
create or replace function public.reporte_semanas(p_empresa uuid)
returns table (semana_id uuid, inicio date, fin date, estado text, pago date, anio integer, mes integer, nro integer)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir_reporte(p_empresa);
  return query
    select s.id, s.inicio, s.fin, s.estado, s.fin + 2, extract(year from s.fin + 2)::int, extract(month from s.fin + 2)::int,
           ((extract(day from s.fin + 2)::int - 1) / 7 + 1)::int
    from semanas s where s.empresa_id = p_empresa order by s.inicio desc limit 156;
end $$;

-- NIB y NHIP por trabajador y semana (el viernes de pago cae entre p_desde y p_hasta).
create or replace function public.reporte_seguros(p_empresa uuid, p_desde date, p_hasta date)
returns table (semana_id uuid, inicio date, fin date, pago date, nro integer, perfil_id uuid,
               apellido text, nombre text, inicial text, nombre_completo text, numero_nib text, numero_nhip text,
               bruto numeric, base_nib numeric, nib_empleado numeric, nib_empleador numeric,
               base_nhip numeric, nhip_empleado numeric, nhip_empleador numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir_reporte(p_empresa);
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Rango de fechas no válido'; end if;
  return query
    select s.id, s.inicio, s.fin, s.fin + 2, ((extract(day from s.fin + 2)::int - 1) / 7 + 1)::int, p.id,
           (public._nombre_legal(p.nombre, p.apellido_legal, p.nombre_legal))[1],
           (public._nombre_legal(p.nombre, p.apellido_legal, p.nombre_legal))[2],
           nullif(btrim(p.inicial_legal), ''), p.nombre::text, p.numero_nib, p.numero_nhip,
           n.bruto, n.base_nib, n.nib_empleado, n.nib_empleador, n.base_nhip, n.nhip_empleado, n.nhip_empleador
    from nomina_semanal n
    join semanas s on s.id = n.semana_id
    join perfiles p on p.id = n.perfil_id
    where s.empresa_id = p_empresa and n.empresa_id = p_empresa and s.estado in ('cerrada', 'pagada') and not n.anulada
      and s.fin + 2 between p_desde and p_hasta
    order by s.inicio, p.nombre;
end $$;

-- Pagado por proyecto y trabajador.
create or replace function public.reporte_proyectos_pagados(p_empresa uuid, p_desde date, p_hasta date)
returns table (semana_id uuid, inicio date, fin date, pago date, nro integer, proyecto_id uuid, proyecto text,
               perfil_id uuid, trabajador text, minutos_reg integer, minutos_extra integer, bruto numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir_reporte(p_empresa);
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Rango de fechas no válido'; end if;
  return query
    select s.id, s.inicio, s.fin, s.fin + 2, ((extract(day from s.fin + 2)::int - 1) / 7 + 1)::int,
           pr.id, pr.nombre::text, p.id, p.nombre::text, np.minutos_reg, np.minutos_extra, np.bruto
    from nomina_proyecto np
    join semanas s on s.id = np.semana_id
    join proyectos pr on pr.id = np.proyecto_id
    join perfiles p on p.id = np.perfil_id
    where s.empresa_id = p_empresa and np.empresa_id = p_empresa and s.estado in ('cerrada', 'pagada') and not np.anulada
      and s.fin + 2 between p_desde and p_hasta
    order by pr.nombre, s.inicio, p.nombre;
end $$;

-- Partes B y C del formulario: quienes empezaron y quienes dejaron la compañía en el mes.
--   Empezó: su primer turno aprobado en esta compañía cae en el mes.
--   Dejó: se le marcó la baja de la compañía en el mes, o está inactivo y su último turno cae en el mes.
create or replace function public.reporte_altas_bajas(p_empresa uuid, p_anio integer, p_mes integer)
returns table (tipo text, perfil_id uuid, apellido text, nombre text, inicial text, nombre_completo text, numero_nib text, fecha date)
language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_ini date := make_date(p_anio, p_mes, 1); v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month')::date;
begin
  perform public._exigir_reporte(p_empresa);
  select e.zona_horaria into v_tz from empresas e where e.id = p_empresa;
  return query
    with t as (
      select x.perfil_id as pid, min((x.entrada at time zone v_tz)::date) as primero, max((x.entrada at time zone v_tz)::date) as ultimo
      from turnos x where x.empresa_id = p_empresa and x.estado in ('aprobado', 'aprobado_admin') group by x.perfil_id),
    base as (
      select p.id as pid, p.nombre as nom, p.apellido_legal, p.nombre_legal, p.inicial_legal, p.numero_nib as nib, p.activo,
             t.primero, t.ultimo, (pe.baja_en at time zone v_tz)::date as baja
      from perfiles p
      join perfil_empresas pe on pe.perfil_id = p.id and pe.empresa_id = p_empresa
      left join t on t.pid = p.id
      where 'trabajador' = any (p.roles))
    select 'alta'::text, b.pid, (public._nombre_legal(b.nom, b.apellido_legal, b.nombre_legal))[1],
           (public._nombre_legal(b.nom, b.apellido_legal, b.nombre_legal))[2], nullif(btrim(b.inicial_legal), ''), b.nom::text, b.nib, b.primero
    from base b where b.primero >= v_ini and b.primero < v_fin
    union all
    select 'baja'::text, b.pid, (public._nombre_legal(b.nom, b.apellido_legal, b.nombre_legal))[1],
           (public._nombre_legal(b.nom, b.apellido_legal, b.nombre_legal))[2], nullif(btrim(b.inicial_legal), ''), b.nom::text, b.nib,
           coalesce(b.baja, b.ultimo)
    from base b
    where (b.baja >= v_ini and b.baja < v_fin)
       or (b.baja is null and not b.activo and b.ultimo >= v_ini and b.ultimo < v_fin)
    order by 1, 8, 6;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'datos_empleador(uuid)', 'guardar_datos_empleador(uuid, text, text, text, text, text)',
    'actualizar_nombre_legal(uuid, text, text, text)', 'reporte_semanas(uuid)', 'reporte_seguros(uuid, date, date)',
    'reporte_proyectos_pagados(uuid, date, date)', 'reporte_altas_bajas(uuid, integer, integer)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public._exigir_reporte(uuid) from public, anon, authenticated;
revoke all on function public._nombre_legal(text, text, text) from public, anon, authenticated;
