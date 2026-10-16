-- ObraPay · Fase B (1): hora extra con multiplicador, marca por compañía y pantalla "Configurar compañía".
-- Lo existente no cambia: multiplicador 1.0 y sin fecha = igual que hasta hoy. Las semanas cerradas guardan su cálculo.

alter table public.empresas
  add column if not exists extra_multiplicador numeric(4, 2) not null default 1 check (extra_multiplicador between 1 and 3),
  add column if not exists extra_mult_desde    date,
  add column if not exists marca_nombre        text check (marca_nombre is null or length(marca_nombre) <= 60),
  add column if not exists marca_color         text check (marca_color is null or marca_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists marca_logo          text check (marca_logo is null or length(marca_logo) <= 150000);

-- Multiplicador que aplica a una semana: el de la compañía si la semana empieza en o después de la fecha de inicio.
create or replace function public._mult_extra(p_semana uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when e.extra_mult_desde is not null and s.inicio >= e.extra_mult_desde then e.extra_multiplicador else 1 end
  from semanas s join empresas e on e.id = s.empresa_id where s.id = p_semana
$$;
revoke all on function public._mult_extra(uuid) from public, anon, authenticated;

create or replace function public._detalle_semana(p_semana uuid)
returns table (perfil_id uuid, proyecto_id uuid, minutos_reg integer, minutos_extra integer, bruto_exacto numeric, sin_tarifa boolean)
language sql stable security definer set search_path = public as $$
  select t.perfil_id, t.proyecto_id, sum(t.min_reg)::integer, sum(t.min_extra)::integer,
         sum((t.min_reg + t.min_extra * public._mult_extra(p_semana)) * coalesce(t.tarifa, 0) / 60.0),
         bool_or(t.tarifa is null)
  from public._turnos_semana(p_semana) t
  group by t.perfil_id, t.proyecto_id
$$;

create or replace function public._calcular_semana(p_semana uuid)
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
           round(sum((t.min_reg + t.min_extra * public._mult_extra(p_semana)) * coalesce(t.tarifa, 0) / 60.0), 2) as bruto,
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
    'zona_horaria', e.zona_horaria,
    'marca_nombre', e.marca_nombre, 'marca_color', e.marca_color, 'marca_logo', e.marca_logo);
end $$;

-- Guarda solo las claves que vienen en p_cambios y deja constancia (quién, cuándo, valor anterior).
create or replace function public.plataforma_guardar_config(p_empresa uuid, p_cambios jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas; v_mult numeric; v_desde date; v_ini time; v_fin time; v_ext time; v_cie time; v_zona text; v_color text; v_logo text; v_nom text;
        v_abierta date; v_reg jsonb := '{}'::jsonb;
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
         almuerzo_inicio = v_ini, almuerzo_fin = v_fin, zona_horaria = v_zona, marca_nombre = v_nom, marca_color = v_color, marca_logo = v_logo
   where id = p_empresa;
  if v_reg <> '{}'::jsonb then perform public._evento(p_empresa, 'config_cambiada', jsonb_build_object('cambios', v_reg)); end if;
end $$;

revoke all on function public.plataforma_config(uuid), public.plataforma_guardar_config(uuid, jsonb) from public, anon;
grant execute on function public.plataforma_config(uuid), public.plataforma_guardar_config(uuid, jsonb) to authenticated;
