-- ObraPay · Inventario de herramientas por compañía.
--   · Cada herramienta pertenece a UNA compañía (empresa_id) y puede prestarse a la otra (empresa_uso_id).
--   · Está en el almacén, a cargo de un supervisor (con proyecto opcional) o encargada por él a un trabajador.
--   · Estados: bueno, danado, perdido, baja. Nada se borra: todo queda en el historial (herramienta_movimientos).
--   · Admin: crea, edita, asigna a supervisores y proyectos, comparte con la otra compañía y da de baja.
--     Supervisor: ve lo que tiene a cargo, lo encarga a sus trabajadores y marca dañada o perdida.
--     Dueño: solo lectura. Todo se lee y escribe por funciones; las tablas no se tocan directamente.

create table public.herramientas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  nombre         text not null check (length(btrim(nombre)) between 1 and 120),
  codigo         text check (codigo is null or length(codigo) <= 60),
  valor          numeric(10, 2) check (valor is null or valor >= 0),
  notas          text check (notas is null or length(notas) <= 500),
  estado         text not null default 'bueno' check (estado in ('bueno', 'danado', 'perdido', 'baja')),
  empresa_uso_id uuid references public.empresas (id),
  supervisor_id  uuid references public.perfiles (id),
  trabajador_id  uuid references public.perfiles (id),
  proyecto_id    uuid references public.proyectos (id),
  creado_por     uuid references public.perfiles (id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index herramientas_empresa on public.herramientas (empresa_id);
create index herramientas_uso on public.herramientas (empresa_uso_id) where empresa_uso_id is not null;
create index herramientas_supervisor on public.herramientas (supervisor_id) where supervisor_id is not null;
create index herramientas_trabajador on public.herramientas (trabajador_id) where trabajador_id is not null;

create table public.herramienta_movimientos (
  id             uuid primary key default gen_random_uuid(),
  herramienta_id uuid not null references public.herramientas (id),
  empresa_id     uuid not null references public.empresas (id),
  tipo           text not null,
  detalle        jsonb not null default '{}'::jsonb,
  nota           text,
  por            uuid references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
create index herramienta_mov_h on public.herramienta_movimientos (herramienta_id, creado_en desc);

alter table public.herramientas enable row level security;
alter table public.herramienta_movimientos enable row level security;
revoke all on public.herramientas from anon, authenticated;
revoke all on public.herramienta_movimientos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ayudas internas
-- ---------------------------------------------------------------------------
create or replace function public._herr_mov(p_h uuid, p_tipo text, p_detalle jsonb, p_nota text) returns void
language sql security definer set search_path = public as $$
  insert into herramienta_movimientos (herramienta_id, empresa_id, tipo, detalle, nota, por)
  select h.id, coalesce(h.empresa_uso_id, h.empresa_id), p_tipo, coalesce(p_detalle, '{}'::jsonb), nullif(btrim(p_nota), ''), auth.uid()
  from herramientas h where h.id = p_h
$$;

-- ¿Puede quien llama ver esta herramienta?
create or replace function public._herr_visible(h public.herramientas) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.es_gerencia()
          and (public.es_miembro(auth.uid(), h.empresa_id)
               or (h.empresa_uso_id is not null and public.es_miembro(auth.uid(), h.empresa_uso_id))))
      or (public.tengo_rol('supervisor')
          and public.es_miembro(auth.uid(), coalesce(h.empresa_uso_id, h.empresa_id))
          and (h.supervisor_id = auth.uid()
               or (h.proyecto_id is not null and public.supervisa_proyecto(h.proyecto_id))
               or (h.trabajador_id is not null and public.supervisa_a(h.trabajador_id))))
$$;

-- Admin de la compañía que la usa ahora (asignar) y admin de la compañía dueña (editar, compartir, baja).
create or replace function public._herr_admin_uso(h public.herramientas) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tengo_rol('admin') and public.es_miembro(auth.uid(), coalesce(h.empresa_uso_id, h.empresa_id))
$$;
create or replace function public._herr_admin_duena(h public.herramientas) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tengo_rol('admin') and public.es_miembro(auth.uid(), h.empresa_id)
$$;

revoke all on function public._herr_mov(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public._herr_visible(public.herramientas) from public, anon, authenticated;
revoke all on function public._herr_admin_uso(public.herramientas) from public, anon, authenticated;
revoke all on function public._herr_admin_duena(public.herramientas) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin: crear y editar
-- ---------------------------------------------------------------------------
create or replace function public.crear_herramienta(
  p_nombre text, p_codigo text default null, p_valor numeric default null, p_notas text default null, p_empresa uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := coalesce(p_empresa, public.mi_empresa()); v_id uuid;
begin
  perform public._exigir_rol('admin');
  if not public.es_miembro(auth.uid(), v_emp) then
    raise exception 'No tienes acceso a esa compañía' using errcode = '42501';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then raise exception 'Falta el nombre de la herramienta'; end if;
  if p_valor is not null and p_valor < 0 then raise exception 'El valor no puede ser negativo'; end if;
  insert into herramientas (empresa_id, nombre, codigo, valor, notas, creado_por)
  values (v_emp, btrim(p_nombre), nullif(btrim(p_codigo), ''), round(p_valor, 2), nullif(btrim(p_notas), ''), auth.uid())
  returning id into v_id;
  perform public._herr_mov(v_id, 'creada', jsonb_build_object('nombre', btrim(p_nombre)), null);
  return v_id;
end $$;

create or replace function public.editar_herramienta(
  p_id uuid, p_nombre text, p_codigo text default null, p_valor numeric default null, p_notas text default null)
returns void language plpgsql security definer set search_path = public as $$
declare h herramientas;
begin
  select * into h from herramientas where id = p_id for update;
  if not found or not public._herr_admin_duena(h) then raise exception 'Herramienta no encontrada'; end if;
  if p_nombre is null or btrim(p_nombre) = '' then raise exception 'Falta el nombre de la herramienta'; end if;
  if p_valor is not null and p_valor < 0 then raise exception 'El valor no puede ser negativo'; end if;
  update herramientas set nombre = btrim(p_nombre), codigo = nullif(btrim(p_codigo), ''), valor = round(p_valor, 2),
         notas = nullif(btrim(p_notas), ''), actualizado_en = now() where id = p_id;
  perform public._herr_mov(p_id, 'editada', jsonb_build_object('nombre', btrim(p_nombre)), null);
end $$;

-- ---------------------------------------------------------------------------
-- Admin: a un supervisor (y proyecto), de vuelta al almacén, o prestada a la otra compañía
-- ---------------------------------------------------------------------------
create or replace function public.herramienta_a_supervisor(p_id uuid, p_supervisor uuid, p_proyecto uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare h herramientas; v_uso uuid;
begin
  select * into h from herramientas where id = p_id for update;
  if not found or not public._herr_admin_uso(h) then raise exception 'Herramienta no encontrada'; end if;
  if h.estado in ('perdido', 'baja') then raise exception 'No se asigna una herramienta perdida o dada de baja'; end if;
  v_uso := coalesce(h.empresa_uso_id, h.empresa_id);
  if p_supervisor is not null and not exists (
       select 1 from perfiles p where p.id = p_supervisor and p.activo and 'supervisor' = any (p.roles)
          and public.es_miembro(p.id, v_uso)) then
    raise exception 'Ese supervisor no pertenece a la compañía que usa la herramienta';
  end if;
  if p_proyecto is not null and not exists (
       select 1 from proyectos where id = p_proyecto and empresa_id = v_uso and activo) then
    raise exception 'El proyecto no pertenece a la compañía que usa la herramienta';
  end if;
  update herramientas set supervisor_id = p_supervisor, trabajador_id = null,
         proyecto_id = case when p_supervisor is null then null else p_proyecto end, actualizado_en = now()
   where id = p_id;
  perform public._herr_mov(p_id, case when p_supervisor is null then 'al_almacen' else 'a_supervisor' end,
    jsonb_build_object('supervisor', p_supervisor, 'proyecto', case when p_supervisor is null then null else p_proyecto end), null);
end $$;

create or replace function public.compartir_herramienta(p_id uuid, p_empresa uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare h herramientas; v_nuevo uuid;
begin
  select * into h from herramientas where id = p_id for update;
  if not found or not public._herr_admin_duena(h) then raise exception 'Herramienta no encontrada'; end if;
  if h.estado in ('perdido', 'baja') then raise exception 'No se presta una herramienta perdida o dada de baja'; end if;
  v_nuevo := case when p_empresa is null or p_empresa = h.empresa_id then null else p_empresa end;
  if v_nuevo is not null and not public.es_miembro(auth.uid(), v_nuevo) then
    raise exception 'No tienes acceso a esa compañía' using errcode = '42501';
  end if;
  if v_nuevo is not distinct from h.empresa_uso_id then
    raise exception 'La herramienta ya está en esa compañía';
  end if;
  update herramientas set empresa_uso_id = v_nuevo, supervisor_id = null, trabajador_id = null, proyecto_id = null,
         actualizado_en = now() where id = p_id;
  perform public._herr_mov(p_id, case when v_nuevo is null then 'devuelta_a_duena' else 'prestada' end,
    jsonb_build_object('desde', coalesce(h.empresa_uso_id, h.empresa_id), 'hacia', coalesce(v_nuevo, h.empresa_id)), null);
end $$;

-- ---------------------------------------------------------------------------
-- Admin o supervisor a cargo: encargar a un trabajador, o recibirla de vuelta
-- ---------------------------------------------------------------------------
create or replace function public.herramienta_a_trabajador(p_id uuid, p_trabajador uuid)
returns void language plpgsql security definer set search_path = public as $$
declare h herramientas; v_uso uuid; v_admin boolean;
begin
  select * into h from herramientas where id = p_id for update;
  if not found then raise exception 'Herramienta no encontrada'; end if;
  v_uso := coalesce(h.empresa_uso_id, h.empresa_id);
  v_admin := public._herr_admin_uso(h);
  if not v_admin and not (public.tengo_rol('supervisor') and h.supervisor_id = auth.uid()
                          and public.es_miembro(auth.uid(), v_uso)) then
    raise exception 'Herramienta no encontrada';
  end if;
  if h.estado in ('perdido', 'baja') then raise exception 'No se asigna una herramienta perdida o dada de baja'; end if;
  if p_trabajador is not null then
    if not exists (select 1 from perfiles p where p.id = p_trabajador and p.activo and 'trabajador' = any (p.roles)
                      and public.es_miembro(p.id, v_uso)) then
      raise exception 'Ese trabajador no pertenece a la compañía que usa la herramienta';
    end if;
    if not v_admin and not public.supervisa_a(p_trabajador) then
      raise exception 'Solo puedes encargar herramientas a tus trabajadores';
    end if;
  end if;
  update herramientas set trabajador_id = p_trabajador, actualizado_en = now() where id = p_id;
  perform public._herr_mov(p_id, case when p_trabajador is null then 'recibida' else 'a_trabajador' end,
    jsonb_build_object('trabajador', coalesce(p_trabajador, h.trabajador_id), 'supervisor', h.supervisor_id), null);
end $$;

-- Dañada, perdida, de nuevo buena, o de baja (la baja solo la da el admin de la compañía dueña).
create or replace function public.herramienta_estado(p_id uuid, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare h herramientas; v_uso uuid; v_admin boolean;
begin
  if p_estado not in ('bueno', 'danado', 'perdido', 'baja') then raise exception 'Estado no válido'; end if;
  select * into h from herramientas where id = p_id for update;
  if not found then raise exception 'Herramienta no encontrada'; end if;
  v_uso := coalesce(h.empresa_uso_id, h.empresa_id);
  v_admin := public._herr_admin_uso(h);
  if not v_admin and not (public.tengo_rol('supervisor') and h.supervisor_id = auth.uid()
                          and public.es_miembro(auth.uid(), v_uso)) then
    raise exception 'Herramienta no encontrada';
  end if;
  if p_estado = 'baja' and not public._herr_admin_duena(h) then
    raise exception 'Solo el admin de la compañía dueña da de baja una herramienta' using errcode = '42501';
  end if;
  if p_estado in ('danado', 'perdido') and (p_nota is null or btrim(p_nota) = '') then
    raise exception 'Cuenta brevemente qué pasó';
  end if;
  if h.estado = 'baja' then raise exception 'La herramienta está dada de baja'; end if;
  if h.estado = p_estado then raise exception 'Ya tiene ese estado'; end if;
  update herramientas set estado = p_estado, actualizado_en = now(),
         supervisor_id = case when p_estado = 'baja' then null else supervisor_id end,
         trabajador_id = case when p_estado = 'baja' then null else trabajador_id end,
         proyecto_id = case when p_estado = 'baja' then null else proyecto_id end
   where id = p_id;
  perform public._herr_mov(p_id, 'estado', jsonb_build_object('antes', h.estado, 'despues', p_estado,
    'supervisor', h.supervisor_id, 'trabajador', h.trabajador_id), p_nota);
end $$;

-- ---------------------------------------------------------------------------
-- Lecturas
-- ---------------------------------------------------------------------------
create or replace function public.herramientas_inventario()
returns table (id uuid, empresa_id uuid, empresa text, nombre text, codigo text, valor numeric, notas text, estado text,
               empresa_uso_id uuid, empresa_uso text, supervisor_id uuid, supervisor text, trabajador_id uuid, trabajador text,
               proyecto_id uuid, proyecto text, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_gerencia() or public.tengo_rol('supervisor')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  return query
    select h.id, h.empresa_id, e.nombre::text, h.nombre, h.codigo, h.valor, h.notas, h.estado,
           h.empresa_uso_id, eu.nombre::text, h.supervisor_id, sp.nombre::text, h.trabajador_id, tp.nombre::text,
           h.proyecto_id, pr.nombre::text, h.creado_en
    from herramientas h
    join empresas e on e.id = h.empresa_id
    left join empresas eu on eu.id = h.empresa_uso_id
    left join perfiles sp on sp.id = h.supervisor_id
    left join perfiles tp on tp.id = h.trabajador_id
    left join proyectos pr on pr.id = h.proyecto_id
    where public._herr_visible(h)
    order by e.nombre, h.nombre;
end $$;

create or replace function public.herramienta_movimientos(p_id uuid)
returns table (creado_en timestamptz, tipo text, nota text, por text, detalle jsonb)
language plpgsql stable security definer set search_path = public as $$
declare h herramientas;
begin
  select * into h from herramientas where id = p_id;
  if not found or not public._herr_visible(h) then raise exception 'Herramienta no encontrada'; end if;
  return query
    select m.creado_en, m.tipo, m.nota, pe.nombre::text, m.detalle
    from herramienta_movimientos m left join perfiles pe on pe.id = m.por
    where m.herramienta_id = p_id order by m.creado_en desc, m.id;
end $$;

-- A quién se puede encargar: el admin ve supervisores, proyectos y trabajadores de sus compañías;
-- el supervisor, solo los trabajadores de los proyectos que supervisa.
create or replace function public.herramientas_personas()
returns table (empresa_id uuid, tipo text, id uuid, nombre text, proyecto_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.tengo_rol('admin') then
    return query
      with mis as (select m.empresa_id as emp from perfil_empresas m where m.perfil_id = auth.uid() and m.baja_en is null)
      select m.empresa_id, 'supervisor'::text, p.id, p.nombre::text, null::uuid
        from perfil_empresas m join perfiles p on p.id = m.perfil_id and p.activo
       where m.empresa_id in (select emp from mis) and m.baja_en is null and 'supervisor' = any (p.roles)
      union all
      select m.empresa_id, 'trabajador', p.id, p.nombre::text, null::uuid
        from perfil_empresas m join perfiles p on p.id = m.perfil_id and p.activo
       where m.empresa_id in (select emp from mis) and m.baja_en is null and 'trabajador' = any (p.roles)
      union all
      select pr.empresa_id, 'proyecto', pr.id, pr.nombre::text, null::uuid
        from proyectos pr where pr.empresa_id in (select emp from mis) and pr.activo;
  elsif public.tengo_rol('supervisor') then
    return query
      select distinct pt.empresa_id, 'trabajador'::text, p.id, p.nombre::text, pt.proyecto_id
        from proyecto_supervisores ps
        join proyecto_trabajadores pt on pt.proyecto_id = ps.proyecto_id
        join perfiles p on p.id = pt.perfil_id and p.activo
       where ps.perfil_id = auth.uid() and public.es_miembro(ps.perfil_id, ps.empresa_id) and public.es_miembro(p.id, pt.empresa_id);
  else
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'crear_herramienta(text, text, numeric, text, uuid)', 'editar_herramienta(uuid, text, text, numeric, text)',
    'herramienta_a_supervisor(uuid, uuid, uuid)', 'compartir_herramienta(uuid, uuid)',
    'herramienta_a_trabajador(uuid, uuid)', 'herramienta_estado(uuid, text, text)',
    'herramientas_inventario()', 'herramienta_movimientos(uuid)', 'herramientas_personas()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
