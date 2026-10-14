-- Quitar a una persona de una compañía sin borrar filas: se marca la baja (baja_en) y deja de contar como miembro.
-- Su historial (turnos, nómina, tarifas) se conserva; si vuelve a compartirse, se reactiva.
alter table public.perfil_empresas add column baja_en timestamptz;

create or replace function public.es_miembro(p_perfil uuid, p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfil_empresas where perfil_id = p_perfil and empresa_id = p_empresa and baja_en is null)
$$;

create or replace function public.mi_empresa() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_yo perfiles; v_h text; v_e uuid;
begin
  select * into v_yo from perfiles where id = auth.uid() and activo;
  if not found then return null; end if;
  begin
    v_h := nullif(current_setting('request.headers', true)::json ->> 'x-empresa-id', '');
  exception when others then v_h := null;
  end;
  if v_h is not null then
    begin v_e := v_h::uuid; exception when others then v_e := null; end;
    if v_e is not null and public.es_miembro(v_yo.id, v_e) then
      return v_e;
    end if;
  end if;
  if v_yo.empresa_activa_id is not null and public.es_miembro(v_yo.id, v_yo.empresa_activa_id) then
    return v_yo.empresa_activa_id;
  end if;
  return v_yo.empresa_id;
end $$;

create or replace function public.mis_empresas()
returns table (id uuid, nombre text, zona_horaria text, activa boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, e.zona_horaria, e.id = public.mi_empresa()
  from empresas e
  join perfil_empresas m on m.empresa_id = e.id and m.perfil_id = auth.uid() and m.baja_en is null
  where exists (select 1 from perfiles where id = auth.uid() and activo)
  order by e.nombre
$$;

create or replace function public.puedo_administrar(p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from perfil_empresas m
    where m.perfil_id = p_perfil and m.baja_en is null and not public.es_miembro(auth.uid(), m.empresa_id)
  )
$$;

create or replace function public.quitar_de_empresa(p_perfil uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_otra uuid;
begin
  perform public._exigir_rol('admin');
  if not public.es_miembro(p_perfil, v_emp) then raise exception 'Trabajador no encontrado'; end if;
  select empresa_id into v_otra from perfil_empresas
   where perfil_id = p_perfil and empresa_id <> v_emp and baja_en is null order by creado_en limit 1;
  if v_otra is null then
    raise exception 'Es su única compañía: desactívalo en lugar de quitarlo';
  end if;
  if exists (select 1 from turnos where perfil_id = p_perfil and empresa_id = v_emp and salida is null) then
    raise exception 'Tiene un turno abierto en esta compañía; ciérralo primero';
  end if;
  update perfil_empresas set baja_en = now() where perfil_id = p_perfil and empresa_id = v_emp;
  update perfiles set empresa_id = v_otra where id = p_perfil and empresa_id = v_emp;
  update perfiles set empresa_activa_id = null where id = p_perfil and empresa_activa_id = v_emp;
  perform public._evento(v_emp, 'trabajador_quitado', jsonb_build_object('perfil', p_perfil));
end $$;
revoke all on function public.quitar_de_empresa(uuid) from public, anon;
grant execute on function public.quitar_de_empresa(uuid) to authenticated;


create or replace function public._tr_asignacion_valida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from proyectos where id = new.proyecto_id and empresa_id = new.empresa_id) then
    raise exception 'El proyecto no pertenece a esa compañía';
  end if;
  if not public.es_miembro(new.perfil_id, new.empresa_id) then
    raise exception 'La persona no pertenece a la compañía de este proyecto';
  end if;
  return new;
end $$;

create or replace function public.supervisa_proyecto(p_proyecto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from proyecto_supervisores s
    where s.proyecto_id = p_proyecto and s.perfil_id = auth.uid() and public.es_miembro(s.perfil_id, s.empresa_id)
  ) and public.tengo_rol('supervisor')
$$;

create or replace function public.supervisa_a(p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from proyecto_supervisores s
    join proyecto_trabajadores t on t.proyecto_id = s.proyecto_id
    where s.perfil_id = auth.uid() and t.perfil_id = p_perfil
      and public.es_miembro(s.perfil_id, s.empresa_id) and public.es_miembro(t.perfil_id, t.empresa_id)
  ) and public.tengo_rol('supervisor')
$$;

alter policy psup_ver on public.proyecto_supervisores
  using (public.es_miembro(perfil_id, empresa_id) and (empresa_id = public.mi_empresa() or perfil_id = auth.uid()));
alter policy ptra_ver on public.proyecto_trabajadores
  using (public.es_miembro(perfil_id, empresa_id) and (empresa_id = public.mi_empresa() or perfil_id = auth.uid()));
alter policy proyectos_ver on public.proyectos
  using (empresa_id = public.mi_empresa()
         or exists (select 1 from public.proyecto_trabajadores pt where pt.proyecto_id = proyectos.id and pt.perfil_id = auth.uid() and public.es_miembro(pt.perfil_id, pt.empresa_id))
         or exists (select 1 from public.proyecto_supervisores ps where ps.proyecto_id = proyectos.id and ps.perfil_id = auth.uid() and public.es_miembro(ps.perfil_id, ps.empresa_id)));

create or replace function public.compartir_trabajador(p_perfil uuid, p_empresa uuid, p_tarifa numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.mi_empresa();
  v_tarifa numeric; v_minimo numeric; v_tz text; v_hoy date; v_roles text[];
begin
  perform public._exigir_rol('admin');
  if not public.es_miembro(p_perfil, v_emp) then raise exception 'Trabajador no encontrado'; end if;
  if p_empresa is null or p_empresa = v_emp then raise exception 'Elige la otra compañía'; end if;
  if not public.es_miembro(auth.uid(), p_empresa) then
    raise exception 'No tienes acceso a esa compañía' using errcode = '42501';
  end if;
  if public.es_miembro(p_perfil, p_empresa) then raise exception 'Ya trabaja en esa compañía'; end if;

  select roles into v_roles from perfiles where id = p_perfil;
  select zona_horaria, salario_minimo_hora into v_tz, v_minimo from empresas where id = p_empresa;
  v_hoy := (now() at time zone v_tz)::date;

  if 'trabajador' = any (v_roles) then
    v_tarifa := coalesce(round(p_tarifa, 2), public.tarifa_vigente(p_perfil, v_hoy, v_emp));
    if v_tarifa is null or v_tarifa <= 0 then raise exception 'Indica la tarifa por hora en la otra compañía'; end if;
    if v_tarifa < v_minimo then
      raise exception 'La tarifa ($%/h) está por debajo del salario mínimo de esa compañía ($%/h)', v_tarifa, v_minimo;
    end if;
    insert into tarifas (empresa_id, perfil_id, monto_hora, vigente_desde, creado_por)
    values (p_empresa, p_perfil, v_tarifa, v_hoy, auth.uid())
    on conflict (perfil_id, empresa_id, vigente_desde) do update set monto_hora = excluded.monto_hora;
  end if;

  insert into perfil_empresas (perfil_id, empresa_id, creado_por) values (p_perfil, p_empresa, auth.uid())
  on conflict (perfil_id, empresa_id) do update set baja_en = null, creado_por = auth.uid();
  perform public._evento(v_emp, 'trabajador_compartido', jsonb_build_object('perfil', p_perfil, 'con', p_empresa));
  perform public._evento(p_empresa, 'trabajador_recibido', jsonb_build_object('perfil', p_perfil, 'desde', v_emp, 'tarifa', v_tarifa));
end $$;

create or replace function public.resumen_empresas(p_desde date, p_hasta date)
returns table (empresa_id uuid, empresa text, proyecto_id uuid, proyecto text, concepto text, monto numeric)
language plpgsql stable security definer set search_path = public as $$
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
        and (s.fin + 2) between p_desde and p_hasta
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
end $$;
