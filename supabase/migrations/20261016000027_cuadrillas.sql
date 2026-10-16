-- Cuadrillas: un atajo encima de los trabajadores, que siguen siendo individuales.
--  · El admin arma cuadrillas con los trabajadores de la compañía; el supervisor puede armar la suya.
--  · Un trabajador pertenece a una sola cuadrilla por compañía.
--  · Se puede asignar la cuadrilla completa a una obra.
--  · El admin o el supervisor de la obra marca entrada y salida de varios a la vez (hora del toque, corregible).
--    Cada turno sigue la aprobación normal y queda marcado con quién lo marcó.
-- Las tablas no se leen directo: todo pasa por funciones.

alter table public.turnos add column if not exists marcado_por uuid references public.perfiles (id);

create table public.cuadrillas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  nombre         text not null check (length(trim(nombre)) between 1 and 60),
  supervisor_id  uuid references public.perfiles (id),
  activo         boolean not null default true,
  creado_por     uuid references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
create unique index cuadrillas_nombre_uq on public.cuadrillas (empresa_id, lower(nombre)) where activo;

create table public.cuadrilla_miembros (
  empresa_id   uuid not null references public.empresas (id),
  perfil_id    uuid not null references public.perfiles (id) on delete cascade,
  cuadrilla_id uuid not null references public.cuadrillas (id) on delete cascade,
  primary key (empresa_id, perfil_id)
);
create index cuadrilla_miembros_cuadrilla on public.cuadrilla_miembros (cuadrilla_id);

alter table public.cuadrillas enable row level security;
alter table public.cuadrilla_miembros enable row level security;
revoke all on public.cuadrillas, public.cuadrilla_miembros from anon, authenticated;

-- ¿Puedo cambiar esta cuadrilla? Admin cualquiera de la compañía; supervisor solo la suya.
create or replace function public._puede_gestionar_cuadrilla(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cuadrillas c
     where c.id = p_id and c.activo and c.empresa_id = public.mi_empresa()
       and (public.tengo_rol('admin') or (public.tengo_rol('supervisor') and c.supervisor_id = auth.uid())))
$$;
revoke all on function public._puede_gestionar_cuadrilla(uuid) from public, anon, authenticated;

-- Cuadrillas con sus miembros. Admin y dueño ven todas; el supervisor, las suyas.
create or replace function public.cuadrillas_lista()
returns table (id uuid, nombre text, supervisor_id uuid, supervisor text, miembros jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_gerencia() or public.tengo_rol('supervisor')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  return query
    select c.id, c.nombre::text, c.supervisor_id, s.nombre::text,
           coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre) order by p.nombre)
                       from cuadrilla_miembros m join perfiles p on p.id = m.perfil_id
                      where m.cuadrilla_id = c.id), '[]'::jsonb)
      from cuadrillas c left join perfiles s on s.id = c.supervisor_id
     where c.empresa_id = public.mi_empresa() and c.activo
       and (public.es_gerencia() or c.supervisor_id = auth.uid())
     order by c.nombre;
end $$;
revoke all on function public.cuadrillas_lista() from public, anon;
grant execute on function public.cuadrillas_lista() to authenticated;

-- Trabajadores de la compañía con su cuadrilla (para armar cuadrillas). Admin y supervisor.
create or replace function public.trabajadores_cuadrilla()
returns table (perfil_id uuid, nombre text, cuadrilla_id uuid, cuadrilla text)
language plpgsql stable security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa();
begin
  if not (public.tengo_rol('admin') or public.tengo_rol('supervisor')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  return query
    select p.id, p.nombre::text, m.cuadrilla_id, c.nombre::text
      from perfiles p
      left join cuadrilla_miembros m on m.perfil_id = p.id and m.empresa_id = v_emp
      left join cuadrillas c on c.id = m.cuadrilla_id
     where p.activo and 'trabajador' = any (p.roles) and public.es_miembro(p.id, v_emp)
     order by p.nombre;
end $$;
revoke all on function public.trabajadores_cuadrilla() from public, anon;
grant execute on function public.trabajadores_cuadrilla() to authenticated;

-- Crear o cambiar una cuadrilla. El admin elige supervisor; la del supervisor siempre es suya.
-- Un trabajador que ya está en otra cuadrilla pasa a esta (el supervisor solo toma a quienes no tienen cuadrilla o son de él).
create or replace function public.guardar_cuadrilla(p_id uuid, p_nombre text, p_supervisor uuid, p_miembros uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.mi_empresa(); v_admin boolean := public.tengo_rol('admin');
  v_nombre text := trim(coalesce(p_nombre, '')); v_sup uuid; v_id uuid := p_id;
  v_miembros uuid[]; x uuid; o record;
begin
  if not (v_admin or public.tengo_rol('supervisor')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  if length(v_nombre) = 0 then raise exception 'Escribe el nombre de la cuadrilla'; end if;
  if length(v_nombre) > 60 then raise exception 'El nombre es demasiado largo'; end if;
  if exists (select 1 from cuadrillas c where c.empresa_id = v_emp and c.activo and lower(c.nombre) = lower(v_nombre) and c.id is distinct from p_id) then
    raise exception 'Ya hay una cuadrilla con ese nombre';
  end if;
  if v_admin then
    v_sup := p_supervisor;
    if v_sup is not null and not exists (select 1 from perfiles p where p.id = v_sup and p.activo and 'supervisor' = any (p.roles) and public.es_miembro(p.id, v_emp)) then
      raise exception 'Supervisor no encontrado';
    end if;
  else
    v_sup := auth.uid();
  end if;
  select coalesce(array_agg(distinct u), '{}') into v_miembros from unnest(coalesce(p_miembros, '{}')) u;
  if cardinality(v_miembros) > 200 then raise exception 'Demasiados trabajadores en una cuadrilla'; end if;

  if p_id is not null then
    if not public._puede_gestionar_cuadrilla(p_id) then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
    update cuadrillas set nombre = v_nombre, supervisor_id = v_sup where id = p_id;
  else
    insert into cuadrillas (empresa_id, nombre, supervisor_id, creado_por) values (v_emp, v_nombre, v_sup, auth.uid()) returning id into v_id;
  end if;

  foreach x in array v_miembros loop
    if not exists (select 1 from perfiles p where p.id = x and p.activo and 'trabajador' = any (p.roles) and public.es_miembro(p.id, v_emp)) then
      raise exception 'Trabajador no encontrado';
    end if;
    select m.cuadrilla_id, c.supervisor_id, c.nombre into o
      from cuadrilla_miembros m join cuadrillas c on c.id = m.cuadrilla_id
     where m.empresa_id = v_emp and m.perfil_id = x;
    if found and o.cuadrilla_id <> v_id and not v_admin and o.supervisor_id is distinct from auth.uid() then
      raise exception '% ya está en la cuadrilla %; pídele al admin que lo cambie', (select nombre from perfiles where id = x), o.nombre;
    end if;
    insert into cuadrilla_miembros (empresa_id, perfil_id, cuadrilla_id) values (v_emp, x, v_id)
    on conflict (empresa_id, perfil_id) do update set cuadrilla_id = excluded.cuadrilla_id;
  end loop;
  delete from cuadrilla_miembros where cuadrilla_id = v_id and perfil_id <> all (v_miembros);

  perform public._evento(v_emp, 'cuadrilla_guardada', jsonb_build_object('cuadrilla', v_id, 'nombre', v_nombre, 'miembros', cardinality(v_miembros)));
  return v_id;
end $$;
revoke all on function public.guardar_cuadrilla(uuid, text, uuid, uuid[]) from public, anon;
grant execute on function public.guardar_cuadrilla(uuid, text, uuid, uuid[]) to authenticated;

create or replace function public.quitar_cuadrilla(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._puede_gestionar_cuadrilla(p_id) then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  delete from cuadrilla_miembros where cuadrilla_id = p_id;
  update cuadrillas set activo = false where id = p_id;
  perform public._evento(public.mi_empresa(), 'cuadrilla_quitada', jsonb_build_object('cuadrilla', p_id));
end $$;
revoke all on function public.quitar_cuadrilla(uuid) from public, anon;
grant execute on function public.quitar_cuadrilla(uuid) to authenticated;

-- Asigna a una obra a todos los de la cuadrilla que aún no estén. Devuelve cuántos agregó.
create or replace function public.asignar_cuadrilla_proyecto(p_cuadrilla uuid, p_proyecto uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); n integer;
begin
  if not public._puede_gestionar_cuadrilla(p_cuadrilla) then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  if not exists (select 1 from proyectos where id = p_proyecto and empresa_id = v_emp and activo) then raise exception 'Proyecto no encontrado'; end if;
  if not (public.tengo_rol('admin') or public.supervisa_proyecto(p_proyecto)) then
    raise exception 'No supervisas esta obra' using errcode = '42501';
  end if;
  insert into proyecto_trabajadores (empresa_id, proyecto_id, perfil_id)
  select v_emp, p_proyecto, m.perfil_id from cuadrilla_miembros m where m.cuadrilla_id = p_cuadrilla
  on conflict do nothing;
  get diagnostics n = row_count;
  perform public._evento(v_emp, 'cuadrilla_asignada', jsonb_build_object('cuadrilla', p_cuadrilla, 'proyecto', p_proyecto, 'agregados', n));
  return n;
end $$;
revoke all on function public.asignar_cuadrilla_proyecto(uuid, uuid) from public, anon;
grant execute on function public.asignar_cuadrilla_proyecto(uuid, uuid) to authenticated;

-- Quién puede marcarse en una obra y cómo está hoy: los de mis cuadrillas (admin: todas) y los asignados a la obra.
create or replace function public.cuadrilla_estado(p_proyecto uuid)
returns table (perfil_id uuid, nombre text, cuadrilla_id uuid, cuadrilla text, asignado boolean, turno_id uuid, entrada timestamptz, turno_proyecto uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_admin boolean := public.tengo_rol('admin');
begin
  if not exists (select 1 from proyectos where id = p_proyecto and empresa_id = v_emp) then raise exception 'Proyecto no encontrado'; end if;
  if not (v_admin or public.supervisa_proyecto(p_proyecto)) then
    raise exception 'No supervisas esta obra' using errcode = '42501';
  end if;
  return query
    with universo as (
      select m.perfil_id as pid from cuadrilla_miembros m join cuadrillas c on c.id = m.cuadrilla_id
       where m.empresa_id = v_emp and c.activo and (v_admin or c.supervisor_id = auth.uid())
      union
      select pt.perfil_id from proyecto_trabajadores pt where pt.proyecto_id = p_proyecto and pt.empresa_id = v_emp)
    select p.id, p.nombre::text, m.cuadrilla_id, c.nombre::text,
           exists (select 1 from proyecto_trabajadores pt where pt.proyecto_id = p_proyecto and pt.perfil_id = p.id),
           t.id, t.entrada, t.proyecto_id
      from universo u
      join perfiles p on p.id = u.pid and p.activo and 'trabajador' = any (p.roles)
      left join cuadrilla_miembros m on m.perfil_id = p.id and m.empresa_id = v_emp
      left join cuadrillas c on c.id = m.cuadrilla_id
      left join turnos t on t.perfil_id = p.id and t.salida is null
     order by c.nombre nulls last, p.nombre;
end $$;
revoke all on function public.cuadrilla_estado(uuid) from public, anon;
grant execute on function public.cuadrilla_estado(uuid) to authenticated;

-- Marcar la entrada de varios a la vez. Hora: la del toque, o la que se corrija (hasta 72 horas atrás).
-- Cada trabajador se revisa por separado: los que no se pueden marcar vuelven en "omitidos" con el motivo.
create or replace function public.marcar_entrada_por(p_proyecto uuid, p_perfiles uuid[], p_hora timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.mi_empresa(); v_tz text; v_hora timestamptz := now(); v_dif boolean := false;
  v_lista uuid[]; x uuid; n integer := 0; v_fallos jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from proyectos where id = p_proyecto and empresa_id = v_emp and activo) then raise exception 'Proyecto no encontrado'; end if;
  if not (public.tengo_rol('admin') or public.supervisa_proyecto(p_proyecto)) then
    raise exception 'No supervisas esta obra' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct u), '{}') into v_lista from unnest(coalesce(p_perfiles, '{}')) u;
  if cardinality(v_lista) = 0 then raise exception 'Elige al menos un trabajador'; end if;
  if cardinality(v_lista) > 200 then raise exception 'Demasiados trabajadores a la vez'; end if;
  if p_hora is not null then
    if p_hora > now() + interval '2 minutes' then raise exception 'La hora está en el futuro'; end if;
    if p_hora < now() - interval '72 hours' then raise exception 'La hora tiene más de 3 días'; end if;
    v_hora := least(p_hora, now());
    v_dif := (now() - v_hora) > interval '5 minutes';
  end if;
  select zona_horaria into v_tz from empresas where id = v_emp;
  perform public.asegurar_semana(v_emp, (v_hora at time zone v_tz)::date);

  foreach x in array v_lista loop
    begin
      if not exists (select 1 from perfiles p where p.id = x and p.activo and 'trabajador' = any (p.roles) and public.es_miembro(p.id, v_emp)) then
        raise exception 'no es trabajador de esta compañía';
      end if;
      if not exists (select 1 from proyecto_trabajadores pt where pt.proyecto_id = p_proyecto and pt.perfil_id = x) then
        raise exception 'no está asignado a esta obra';
      end if;
      if exists (select 1 from turnos t where t.perfil_id = x and t.salida is null) then
        raise exception 'ya tiene un turno abierto';
      end if;
      if exists (select 1 from turnos t where t.perfil_id = x and t.salida > v_hora) then
        raise exception 'la hora se cruza con otro turno suyo';
      end if;
      insert into turnos (empresa_id, perfil_id, proyecto_id, entrada, marca_diferida, marcado_por)
      values (v_emp, x, p_proyecto, v_hora, v_dif, auth.uid());
      n := n + 1;
    exception when others then
      v_fallos := v_fallos || jsonb_build_object('perfil', x, 'nombre', (select p.nombre from perfiles p where p.id = x), 'motivo', sqlerrm);
    end;
  end loop;
  perform public._evento(v_emp, 'cuadrilla_entrada', jsonb_build_object('proyecto', p_proyecto, 'marcados', n, 'omitidos', jsonb_array_length(v_fallos)));
  return jsonb_build_object('marcados', n, 'omitidos', v_fallos);
end $$;
revoke all on function public.marcar_entrada_por(uuid, uuid[], timestamptz) from public, anon;
grant execute on function public.marcar_entrada_por(uuid, uuid[], timestamptz) to authenticated;

-- Marcar la salida de varios a la vez (turnos abiertos de las obras que supervisa; el admin, cualquiera).
create or replace function public.marcar_salida_por(p_perfiles uuid[], p_hora timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.mi_empresa(); v_hora timestamptz := now(); v_dif boolean := false;
  v_lista uuid[]; x uuid; t turnos; v_salida timestamptz; v_pend boolean; n integer := 0; v_fallos jsonb := '[]'::jsonb;
begin
  if not (public.tengo_rol('admin') or public.tengo_rol('supervisor')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct u), '{}') into v_lista from unnest(coalesce(p_perfiles, '{}')) u;
  if cardinality(v_lista) = 0 then raise exception 'Elige al menos un trabajador'; end if;
  if cardinality(v_lista) > 200 then raise exception 'Demasiados trabajadores a la vez'; end if;
  if p_hora is not null then
    if p_hora > now() + interval '2 minutes' then raise exception 'La hora está en el futuro'; end if;
    v_hora := least(p_hora, now());
    v_dif := (now() - v_hora) > interval '5 minutes';
  end if;

  foreach x in array v_lista loop
    begin
      select * into t from turnos where perfil_id = x and salida is null for update;
      if not found then raise exception 'no tiene un turno abierto'; end if;
      if t.empresa_id <> v_emp or not (public.tengo_rol('admin') or public.supervisa_proyecto(t.proyecto_id)) then
        raise exception 'no puedes marcar a esta persona';
      end if;
      v_salida := greatest(v_hora, t.entrada + interval '1 second');
      v_pend := public._requiere_aprobacion(t.empresa_id, t.entrada, v_salida, t.fuera_de_area) or v_dif or t.marca_diferida;
      update turnos
         set salida = v_salida, marca_diferida = t.marca_diferida or v_dif,
             marcado_por = coalesce(t.marcado_por, auth.uid()),
             estado = case when v_pend then 'por_aprobar' else 'aprobado' end,
             aprobado_en = case when v_pend then null else now() end
       where id = t.id;
      n := n + 1;
    exception when others then
      v_fallos := v_fallos || jsonb_build_object('perfil', x, 'nombre', (select p.nombre from perfiles p where p.id = x), 'motivo', sqlerrm);
    end;
  end loop;
  perform public._evento(v_emp, 'cuadrilla_salida', jsonb_build_object('marcados', n, 'omitidos', jsonb_array_length(v_fallos)));
  return jsonb_build_object('marcados', n, 'omitidos', v_fallos);
end $$;
revoke all on function public.marcar_salida_por(uuid[], timestamptz) from public, anon;
grant execute on function public.marcar_salida_por(uuid[], timestamptz) to authenticated;
