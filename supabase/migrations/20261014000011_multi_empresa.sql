-- ObraPay · Varias compañías en la misma cuenta (Current Ltd y la compañía del padre)
-- Idea: cada compañía es un negocio separado. Una persona puede pertenecer a las dos, pero sus horas,
-- semanas, nómina, NIB/NHIP, préstamos y reportes viven siempre dentro de UNA compañía.
--
--   · `perfil_empresas`  : a qué compañías pertenece cada persona (`perfiles.empresa_id` queda como su compañía de inicio).
--   · `mi_empresa()`     : la compañía "activa" de quien llama. La app la manda en el encabezado `x-empresa-id`;
--                          solo se acepta si la persona pertenece a ella (si no, vuelve a su compañía de inicio).
--                          Respaldo sin encabezado: `perfiles.empresa_activa_id` (función `elegir_empresa`).
--   · Un turno pertenece a la compañía de su PROYECTO, no a la de la persona; `marcar_entrada` la deduce sola.
--   · La tarifa es por persona y por compañía (al compartir un trabajador se copia la tarifa; luego es independiente).
--   · Un trabajador no puede tener turnos que se solapen, ni dentro de una compañía ni entre las dos.
--   · Gastos manuales (materiales, herramientas, pólizas...) por compañía y proyecto, y un resumen de solo
--     lectura que junta las compañías de quien llama sin mezclarlas.
-- Los roles siguen siendo globales: quien administra una compañía solo puede tocar a personas cuyas
-- compañías sean todas suyas también.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Membresías
-- ---------------------------------------------------------------------------
create table public.perfil_empresas (
  perfil_id   uuid not null references public.perfiles (id) on delete cascade,
  empresa_id  uuid not null references public.empresas (id),
  creado_por  uuid references public.perfiles (id),
  creado_en   timestamptz not null default now(),
  primary key (perfil_id, empresa_id)
);
create index perfil_empresas_empresa on public.perfil_empresas (empresa_id);

insert into public.perfil_empresas (perfil_id, empresa_id) select id, empresa_id from public.perfiles;

alter table public.perfiles add column empresa_activa_id uuid references public.empresas (id) on delete set null;

create or replace function public._tr_perfil_membresia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfil_empresas (perfil_id, empresa_id) values (new.id, new.empresa_id) on conflict do nothing;
  return new;
end $$;
create trigger perfil_membresia after insert on public.perfiles
  for each row execute function public._tr_perfil_membresia();

alter table public.perfil_empresas enable row level security;
revoke all on public.perfil_empresas from anon, authenticated;
grant select on public.perfil_empresas to authenticated;

create or replace function public.es_miembro(p_perfil uuid, p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfil_empresas where perfil_id = p_perfil and empresa_id = p_empresa)
$$;

-- Compañía activa de quien llama.
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
    if v_e is not null and exists (select 1 from perfil_empresas where perfil_id = v_yo.id and empresa_id = v_e) then
      return v_e;
    end if;
  end if;
  if v_yo.empresa_activa_id is not null
     and exists (select 1 from perfil_empresas where perfil_id = v_yo.id and empresa_id = v_yo.empresa_activa_id) then
    return v_yo.empresa_activa_id;
  end if;
  return v_yo.empresa_id;
end $$;

-- Compañías de quien llama (para el selector). La tabla `empresas` sigue mostrando solo la activa.
create or replace function public.mis_empresas()
returns table (id uuid, nombre text, zona_horaria text, activa boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, e.zona_horaria, e.id = public.mi_empresa()
  from empresas e
  join perfil_empresas m on m.empresa_id = e.id and m.perfil_id = auth.uid()
  where exists (select 1 from perfiles where id = auth.uid() and activo)
  order by e.nombre
$$;

-- Respaldo para elegir la compañía activa sin encabezado.
create or replace function public.elegir_empresa(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_miembro(auth.uid(), p_empresa) then
    raise exception 'No perteneces a esa compañía' using errcode = '42501';
  end if;
  update perfiles set empresa_activa_id = p_empresa where id = auth.uid();
end $$;

-- ¿Puede quien llama administrar a esta persona? Solo si TODAS las compañías de la persona son también suyas.
create or replace function public.puedo_administrar(p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from perfil_empresas m
    where m.perfil_id = p_perfil and not public.es_miembro(auth.uid(), m.empresa_id)
  )
$$;

create policy membresias_ver on public.perfil_empresas for select to authenticated
  using (perfil_id = auth.uid() or (empresa_id = public.mi_empresa() and public.es_gerencia()));

-- ---------------------------------------------------------------------------
-- Tarifa por persona y por compañía
-- ---------------------------------------------------------------------------
alter table public.tarifas drop constraint tarifas_perfil_id_vigente_desde_key;
alter table public.tarifas add constraint tarifas_perfil_empresa_desde_key unique (perfil_id, empresa_id, vigente_desde);

create or replace function public.tarifa_vigente(p_perfil uuid, p_fecha date, p_empresa uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select monto_hora from tarifas
  where perfil_id = p_perfil and empresa_id = p_empresa and vigente_desde <= p_fecha
  order by vigente_desde desc limit 1
$$;
revoke all on function public.tarifa_vigente(uuid, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permisos de lectura entre compañías
-- ---------------------------------------------------------------------------
drop policy perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid()
         or public.supervisa_a(id)
         or (public.es_miembro(id, public.mi_empresa()) and public.es_gerencia()));

drop policy perfiles_admin_editar on public.perfiles;
create policy perfiles_admin_editar on public.perfiles for update to authenticated
  using (public.es_miembro(id, public.mi_empresa()) and public.tengo_rol('admin') and public.puedo_administrar(id))
  with check (public.es_miembro(id, public.mi_empresa()));

-- Proyectos y asignaciones: la compañía activa, más lo que la persona tiene asignado en cualquiera.
drop policy proyectos_ver on public.proyectos;
create policy proyectos_ver on public.proyectos for select to authenticated
  using (empresa_id = public.mi_empresa()
         or exists (select 1 from public.proyecto_trabajadores pt where pt.proyecto_id = proyectos.id and pt.perfil_id = auth.uid())
         or exists (select 1 from public.proyecto_supervisores ps where ps.proyecto_id = proyectos.id and ps.perfil_id = auth.uid()));
drop policy psup_ver on public.proyecto_supervisores;
create policy psup_ver on public.proyecto_supervisores for select to authenticated
  using (empresa_id = public.mi_empresa() or perfil_id = auth.uid());
drop policy ptra_ver on public.proyecto_trabajadores;
create policy ptra_ver on public.proyecto_trabajadores for select to authenticated
  using (empresa_id = public.mi_empresa() or perfil_id = auth.uid());

-- Semanas: gerencia ve las de la compañía activa; un trabajador ve las de todas sus compañías.
drop policy semanas_ver on public.semanas;
create policy semanas_ver on public.semanas for select to authenticated
  using (empresa_id = public.mi_empresa()
         or (not public.es_gerencia() and public.es_miembro(auth.uid(), empresa_id)));

-- Turnos: el propio, los de proyectos que supervisa (en cualquier compañía) o gerencia de la compañía activa.
drop policy turnos_ver on public.turnos;
create policy turnos_ver on public.turnos for select to authenticated
  using (perfil_id = auth.uid()
         or public.supervisa_proyecto(proyecto_id)
         or (empresa_id = public.mi_empresa() and public.es_gerencia()));

-- ---------------------------------------------------------------------------
-- Funciones que cambian: la compañía de un turno es la de su proyecto
-- ---------------------------------------------------------------------------

create or replace function public._turnos_semana(p_semana uuid)
returns table (
  turno_id uuid, perfil_id uuid, proyecto_id uuid, fecha date,
  min_reg integer, min_extra integer, tarifa numeric, aprobado_admin boolean
)
language sql stable security definer set search_path = public as $$
  with sem as (
    select s.*, e.zona_horaria as tz, e.hora_extra_desde as hx,
           e.almuerzo_inicio as alm_ini, e.almuerzo_fin as alm_fin
    from semanas s join empresas e on e.id = s.empresa_id
    where s.id = p_semana
  ),
  base as (
    select t.id, t.perfil_id, t.proyecto_id, sem.empresa_id,
           (t.entrada at time zone sem.tz)::date as fecha,
           m.min_reg, m.min_extra,
           t.estado = 'aprobado_admin' as aprobado_admin
    from sem
    join turnos t on t.empresa_id = sem.empresa_id
    cross join lateral public.minutos_turno(t.entrada, t.salida, sem.tz, sem.hx, sem.alm_ini, sem.alm_fin) m
    where t.estado in ('aprobado', 'aprobado_admin')
      and t.salida is not null
      and (
        -- Abierta: el turno pertenece a la semana abierta más antigua que lo cubre.
        (sem.estado = 'abierta' and t.semana_id is null
         and sem.id = (select s2.id from semanas s2
                       where s2.empresa_id = sem.empresa_id and s2.estado = 'abierta'
                         and s2.fin >= (t.entrada at time zone sem.tz)::date
                       order by s2.inicio limit 1))
        or (sem.estado <> 'abierta' and t.semana_id = sem.id)
      )
  )
  select b.id, b.perfil_id, b.proyecto_id, b.fecha, b.min_reg, b.min_extra,
         public.tarifa_vigente(b.perfil_id, b.fecha, b.empresa_id), b.aprobado_admin
  from base b
$$;

create or replace function public.marcar_entrada(
  p_proyecto uuid, p_lat double precision default null, p_lng double precision default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  yo perfiles;
  v_emp uuid;
  v_tz text;
  v_fuera boolean;
  v_id uuid;
begin
  select * into yo from perfiles where id = auth.uid() and activo;
  if not found then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not ('trabajador' = any (yo.roles)) then
    raise exception 'Tu usuario no marca horas';
  end if;
  -- La compañía sale del proyecto: debe estar asignado a él y pertenecer a esa compañía.
  select p.empresa_id into v_emp
    from proyecto_trabajadores pt join proyectos p on p.id = pt.proyecto_id
   where pt.proyecto_id = p_proyecto and pt.perfil_id = yo.id and p.activo
     and public.es_miembro(yo.id, p.empresa_id);
  if v_emp is null then
    raise exception 'No estás asignado a este proyecto';
  end if;
  if exists (select 1 from turnos where perfil_id = yo.id and salida is null) then
    raise exception 'Ya tienes un turno abierto; marca salida primero';
  end if;

  v_fuera := public._revisar_gps(v_emp, p_proyecto, p_lat, p_lng);
  select zona_horaria into v_tz from empresas where id = v_emp;
  perform public.asegurar_semana(v_emp, (now() at time zone v_tz)::date);

  insert into turnos (empresa_id, perfil_id, proyecto_id, entrada, entrada_lat, entrada_lng, fuera_de_area)
  values (v_emp, yo.id, p_proyecto, now(), p_lat, p_lng, v_fuera)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.aprobar_turnos(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  t turnos;
  v_estado text;
  n integer := 0;
begin
  for t in select * from turnos where id = any (p_ids) and (empresa_id = public.mi_empresa() or public.supervisa_proyecto(proyecto_id)) for update loop
    if t.semana_id is not null then
      raise exception 'Ese turno ya está en una semana cerrada';
    end if;
    if t.perfil_id = auth.uid() then
      raise exception 'No puedes aprobar tu propio turno';
    end if;
    if public.supervisa_proyecto(t.proyecto_id) then
      v_estado := 'aprobado';
    elsif public.tengo_rol('admin') then
      v_estado := 'aprobado_admin';
    else
      raise exception 'No puedes aprobar turnos de este proyecto' using errcode = '42501';
    end if;
    if t.estado = 'por_aprobar' or (t.estado = 'aprobado_admin' and v_estado = 'aprobado') then
      update turnos set estado = v_estado, aprobado_por = auth.uid(), aprobado_en = now() where id = t.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.corregir_turno(
  p_id uuid, p_entrada timestamptz, p_salida timestamptz, p_motivo text
) returns void language plpgsql security definer set search_path = public as $$
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
   where empresa_id = t.empresa_id and inicio = public.semana_inicio_de((p_entrada at time zone v_tz)::date);
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
end $$;

-- Tarifas, préstamos y datos por compañía: la persona debe pertenecer a la compañía activa.
create or replace function public.cambiar_tarifa(p_perfil uuid, p_monto numeric, p_desde date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.mi_empresa(); v_antes numeric; v_minimo numeric;
begin
  perform public._exigir_rol('admin');
  if not public.es_miembro(p_perfil, v_emp) then raise exception 'Trabajador no encontrado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'La tarifa debe ser mayor que cero'; end if;
  select salario_minimo_hora into v_minimo from empresas where id = v_emp;
  if round(p_monto, 2) < v_minimo then
    raise exception 'La tarifa ($%/h) está por debajo del salario mínimo de la empresa ($%/h)', round(p_monto, 2), v_minimo;
  end if;
  v_antes := public.tarifa_vigente(p_perfil, p_desde, v_emp);
  insert into tarifas (empresa_id, perfil_id, monto_hora, vigente_desde, creado_por)
  values (v_emp, p_perfil, round(p_monto, 2), p_desde, auth.uid())
  on conflict (perfil_id, empresa_id, vigente_desde) do update set monto_hora = excluded.monto_hora, creado_por = excluded.creado_por;
  if v_antes is distinct from round(p_monto, 2) then
    insert into notificaciones (empresa_id, perfil_id, tipo, datos)
    values (v_emp, p_perfil, 'cambio_tarifa', jsonb_build_object('antes', v_antes, 'despues', round(p_monto, 2), 'desde', p_desde));
  end if;
  perform public._evento(v_emp, 'cambio_tarifa', jsonb_build_object('perfil', p_perfil, 'antes', v_antes, 'despues', round(p_monto, 2), 'desde', p_desde));
end $$;

create or replace function public.cambiar_seguro(p_perfil uuid, p_porcentaje numeric, p_desde date)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa();
begin
  perform public._exigir_rol('admin');
  if not public.es_miembro(p_perfil, v_emp) then
    raise exception 'Trabajador no encontrado';
  end if;
  insert into seguros (empresa_id, perfil_id, porcentaje, vigente_desde, creado_por)
  values (v_emp, p_perfil, p_porcentaje, p_desde, auth.uid())
  on conflict (perfil_id, vigente_desde) do update set porcentaje = excluded.porcentaje, creado_por = excluded.creado_por;
  perform public._evento(v_emp, 'cambio_seguro', jsonb_build_object('perfil', p_perfil, 'porcentaje', p_porcentaje, 'desde', p_desde));
end $$;

create or replace function public.crear_prestamo(p_perfil uuid, p_monto numeric, p_fecha date default current_date, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_id uuid;
begin
  perform public._exigir_rol('admin');
  if not public.es_miembro(p_perfil, v_emp) then
    raise exception 'Trabajador no encontrado';
  end if;
  insert into prestamos (empresa_id, perfil_id, monto_total, fecha, nota, creado_por)
  values (v_emp, p_perfil, round(p_monto, 2), p_fecha, p_nota, auth.uid())
  returning id into v_id;
  perform public._evento(v_emp, 'prestamo_creado', jsonb_build_object('prestamo', v_id, 'perfil', p_perfil, 'monto', round(p_monto, 2)));
  return v_id;
end $$;

create or replace function public.actualizar_datos_estatutarios(p_perfil uuid, p_numero_nib text, p_numero_nhip text, p_permiso_aprobado date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.mi_empresa();
begin
  perform public._exigir_rol('admin');
  update perfiles set numero_nib = nullif(trim(p_numero_nib), ''), numero_nhip = nullif(trim(p_numero_nhip), ''),
         permiso_trabajo_aprobado = p_permiso_aprobado
   where id = p_perfil and public.es_miembro(id, v_emp);
  if not found then raise exception 'Trabajador no encontrado'; end if;
  perform public._evento(v_emp, 'datos_estatutarios', jsonb_build_object('perfil', p_perfil));
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
      where n.perfil_id = p.id and s.empresa_id = public.mi_empresa() and not n.anulada and s.estado in ('cerrada', 'pagada') and s.fin >= p.permiso_trabajo_aprobado
    ) x on true
    where public.es_miembro(p.id, public.mi_empresa()) and p.activo and p.permiso_trabajo_aprobado is not null and p.numero_nhip is null
    order by p.permiso_trabajo_aprobado;
end $$;

create or replace function public.nomina_semana(p_semana uuid)
returns table (
  perfil_id uuid, nombre text, oficio text, minutos_reg integer, minutos_extra integer,
  tarifa numeric, bruto numeric, seguro_pct numeric, seguro numeric, prestamo numeric, neto numeric,
  con_aprobacion_admin boolean, estado_semana text
) language plpgsql stable security definer set search_path = public as $$
declare
  s semanas;
  v_todos boolean := public.tengo_rol('admin') or public.tengo_rol('dueno');
begin
  select * into s from semanas where id = p_semana and empresa_id = public.mi_empresa();
  if not found then raise exception 'Semana no encontrada'; end if;

  if s.estado = 'abierta' then
    return query
      select c.perfil_id, p.nombre, p.oficio, c.minutos_reg, c.minutos_extra,
             public.tarifa_vigente(c.perfil_id, s.fin, s.empresa_id), c.bruto, c.seguro_pct, c.seguro, c.prestamo, c.neto,
             c.con_aprobacion_admin, s.estado
      from public._calcular_semana(p_semana) c join perfiles p on p.id = c.perfil_id
      where v_todos or c.perfil_id = auth.uid()
      order by p.nombre;
  else
    return query
      select n.perfil_id, p.nombre, p.oficio, n.minutos_reg, n.minutos_extra,
             public.tarifa_vigente(n.perfil_id, s.fin, s.empresa_id), n.bruto, n.seguro_pct, n.seguro, n.prestamo, n.neto,
             n.con_aprobacion_admin, s.estado
      from nomina_semanal n join perfiles p on p.id = n.perfil_id
      where n.semana_id = p_semana and not n.anulada and (v_todos or n.perfil_id = auth.uid())
      order by p.nombre;
  end if;
end $$;

-- Avisos a los admin de cada compañía (quien pertenece a ella y es admin).
create or replace function public.avisar_remesas(p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path to 'public' as $$
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
       where s.empresa_id = e.id and s.estado in ('cerrada', 'pagada') and not x.anulada and date_trunc('month', s.fin + 2) = v_mes;
      insert into notificaciones (empresa_id, perfil_id, tipo, datos)
      select e.id, p.id, 'remesa_por_vencer', jsonb_build_object('agencia', a, 'vence', v_vence, 'mes', to_char(v_mes, 'YYYY-MM'), 'total', v_total, 'dias', v_dias)
      from perfiles p where public.es_miembro(p.id, e.id) and p.activo and 'admin' = any (p.roles);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.avisar_pendientes(p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path to 'public' as $$
declare e record; s record; r record; v_hoy date; v_n integer; v_f integer; n integer := 0;
begin
  for e in select id, zona_horaria from empresas loop
    v_hoy := (p_ahora at time zone e.zona_horaria)::date;

    -- Semana por cerrar: hoy es el último día (miércoles) de la semana abierta.
    for s in select id, inicio, fin from semanas where empresa_id = e.id and estado = 'abierta' and fin = v_hoy loop
      insert into notificaciones (empresa_id, perfil_id, tipo, datos)
      select e.id, p.id, 'semana_por_cerrar', jsonb_build_object('semana', s.id, 'inicio', s.inicio, 'fin', s.fin)
      from perfiles p
      where public.es_miembro(p.id, e.id) and p.activo and 'admin' = any (p.roles)
        and not exists (select 1 from notificaciones x where x.perfil_id = p.id and x.tipo = 'semana_por_cerrar' and x.datos ->> 'semana' = s.id::text);
      get diagnostics v_f = row_count; n := n + v_f;
    end loop;

    -- Turnos por aprobar con más de un día.
    select count(*) into v_n from turnos
      where empresa_id = e.id and estado = 'por_aprobar' and salida is not null and entrada < p_ahora - interval '1 day';
    if v_n > 0 then
      insert into notificaciones (empresa_id, perfil_id, tipo, datos)
      select e.id, p.id, 'turnos_sin_aprobar', jsonb_build_object('n', v_n)
      from perfiles p
      where public.es_miembro(p.id, e.id) and p.activo and 'admin' = any (p.roles)
        and not exists (select 1 from notificaciones x where x.perfil_id = p.id and x.tipo = 'turnos_sin_aprobar' and not x.leida);
      get diagnostics v_f = row_count; n := n + v_f;
    end if;

    -- Trabajador que cruzó el tope mensual de NIB o NHIP al cerrar una semana (cerrada en las últimas 24 h).
    for r in
      select ns.perfil_id, ns.semana_id, pf.nombre,
             case when ns.base_nib > 0 and ns.base_nib < ns.bruto then true else false end as tope_nib,
             case when ns.base_nhip > 0 and ns.base_nhip < ns.bruto then true else false end as tope_nhip
      from nomina_semanal ns join semanas se on se.id = ns.semana_id join perfiles pf on pf.id = ns.perfil_id
      where se.empresa_id = e.id and not ns.anulada and se.estado in ('cerrada', 'pagada') and se.cerrada_en > p_ahora - interval '1 day'
    loop
      for s in select a as agencia from unnest(array[case when r.tope_nib then 'NIB' end, case when r.tope_nhip then 'NHIP' end]) a where a is not null loop
        insert into notificaciones (empresa_id, perfil_id, tipo, datos)
        select e.id, p.id, 'tope_seguro', jsonb_build_object('agencia', s.agencia, 'perfil', r.perfil_id, 'nombre', r.nombre, 'semana', r.semana_id)
        from perfiles p
        where public.es_miembro(p.id, e.id) and p.activo and 'admin' = any (p.roles)
          and not exists (select 1 from notificaciones x where x.perfil_id = p.id and x.tipo = 'tope_seguro'
                          and x.datos ->> 'perfil' = r.perfil_id::text and x.datos ->> 'semana' = r.semana_id::text and x.datos ->> 'agencia' = s.agencia);
        get diagnostics v_f = row_count; n := n + v_f;
      end loop;
    end loop;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Compartir un trabajador con la otra compañía / quitarlo de la compañía activa (admin)
-- ---------------------------------------------------------------------------
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

  insert into perfil_empresas (perfil_id, empresa_id, creado_por) values (p_perfil, p_empresa, auth.uid());
  perform public._evento(v_emp, 'trabajador_compartido', jsonb_build_object('perfil', p_perfil, 'con', p_empresa));
  perform public._evento(p_empresa, 'trabajador_recibido', jsonb_build_object('perfil', p_perfil, 'desde', v_emp, 'tarifa', v_tarifa));
end $$;

create or replace function public.quitar_de_empresa(p_perfil uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_otra uuid;
begin
  perform public._exigir_rol('admin');
  if not public.es_miembro(p_perfil, v_emp) then raise exception 'Trabajador no encontrado'; end if;
  select empresa_id into v_otra from perfil_empresas where perfil_id = p_perfil and empresa_id <> v_emp order by creado_en limit 1;
  if v_otra is null then
    raise exception 'Es su única compañía: desactívalo en lugar de quitarlo';
  end if;
  if exists (select 1 from turnos where perfil_id = p_perfil and empresa_id = v_emp and salida is null) then
    raise exception 'Tiene un turno abierto en esta compañía; ciérralo primero';
  end if;
  delete from proyecto_trabajadores where empresa_id = v_emp and perfil_id = p_perfil;
  delete from proyecto_supervisores where empresa_id = v_emp and perfil_id = p_perfil;
  delete from perfil_empresas where perfil_id = p_perfil and empresa_id = v_emp;
  update perfiles set empresa_id = v_otra where id = p_perfil and empresa_id = v_emp;
  update perfiles set empresa_activa_id = null where id = p_perfil and empresa_activa_id = v_emp;
  perform public._evento(v_emp, 'trabajador_quitado', jsonb_build_object('perfil', p_perfil));
end $$;

-- ---------------------------------------------------------------------------
-- Gastos manuales por compañía y proyecto (materiales, herramientas, pólizas...)
-- La mano de obra y los aportes NIB/NHIP ya salen de la nómina; aquí va lo demás.
-- ---------------------------------------------------------------------------
create table public.gastos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id),
  proyecto_id     uuid references public.proyectos (id),
  categoria       text not null check (categoria in ('materiales', 'herramientas', 'poliza', 'transporte', 'subcontrato', 'otros')),
  monto           numeric(12, 2) not null check (monto > 0),
  fecha           date not null,
  descripcion     text,
  proveedor       text,
  anulado         boolean not null default false,
  anulado_motivo  text,
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now()
);
create index gastos_empresa_fecha on public.gastos (empresa_id, fecha);
create index gastos_proyecto on public.gastos (proyecto_id);

alter table public.gastos enable row level security;
revoke all on public.gastos from anon, authenticated;
grant select on public.gastos to authenticated;
create policy gastos_ver on public.gastos for select to authenticated
  using (empresa_id = public.mi_empresa() and (public.es_gerencia() or creado_por = auth.uid()));

create or replace function public.registrar_gasto(
  p_proyecto uuid, p_categoria text, p_monto numeric, p_fecha date,
  p_descripcion text default null, p_proveedor text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_id uuid;
begin
  if not (public.tengo_rol('admin') or public.tengo_rol('supervisor')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  if not public.tengo_rol('admin') then
    if p_proyecto is null or not exists (select 1 from proyecto_supervisores where proyecto_id = p_proyecto and perfil_id = auth.uid() and empresa_id = v_emp) then
      raise exception 'Solo puedes registrar gastos de proyectos que supervisas';
    end if;
  end if;
  if p_proyecto is not null and not exists (select 1 from proyectos where id = p_proyecto and empresa_id = v_emp) then
    raise exception 'Proyecto no encontrado';
  end if;
  if p_categoria is null or p_categoria not in ('materiales', 'herramientas', 'poliza', 'transporte', 'subcontrato', 'otros') then
    raise exception 'Categoría no válida';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_fecha is null then raise exception 'Falta la fecha del gasto'; end if;
  insert into gastos (empresa_id, proyecto_id, categoria, monto, fecha, descripcion, proveedor, creado_por)
  values (v_emp, p_proyecto, p_categoria, round(p_monto, 2), p_fecha,
          nullif(trim(p_descripcion), ''), nullif(trim(p_proveedor), ''), auth.uid())
  returning id into v_id;
  perform public._evento(v_emp, 'gasto_registrado',
    jsonb_build_object('gasto', v_id, 'categoria', p_categoria, 'monto', round(p_monto, 2), 'proyecto', p_proyecto));
  return v_id;
end $$;

create or replace function public.anular_gasto(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa();
begin
  perform public._exigir_rol('admin');
  if coalesce(length(trim(p_motivo)), 0) = 0 then raise exception 'Escribe el motivo para anular el gasto'; end if;
  update gastos set anulado = true, anulado_motivo = trim(p_motivo) where id = p_id and empresa_id = v_emp and not anulado;
  if not found then raise exception 'Gasto no encontrado'; end if;
  perform public._evento(v_emp, 'gasto_anulado', jsonb_build_object('gasto', p_id, 'motivo', trim(p_motivo)));
end $$;

-- Resumen de solo lectura de TODAS las compañías de quien llama, sin mezclarlas: una fila por
-- compañía, proyecto y concepto. Mano de obra = bruto de semanas cerradas o pagadas cuyo viernes de pago
-- cae en el rango; los aportes del empleador (NIB/NHIP) no tienen proyecto; los gastos usan su fecha.
create or replace function public.resumen_empresas(p_desde date, p_hasta date)
returns table (empresa_id uuid, empresa text, proyecto_id uuid, proyecto text, concepto text, monto numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_gerencia() then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Rango de fechas no válido'; end if;
  return query
    with mis as (select m.empresa_id as emp from perfil_empresas m where m.perfil_id = auth.uid()),
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

-- ---------------------------------------------------------------------------
-- Un trabajador no puede estar en dos turnos a la vez (ni dentro de una compañía ni entre las dos).
-- El rango es [entrada, salida): salir a las 12:00 y entrar a las 12:00 en la otra compañía sí se permite.
-- ---------------------------------------------------------------------------
alter table public.turnos add constraint turnos_sin_solape
  exclude using gist (perfil_id with =, tstzrange(entrada, coalesce(salida, 'infinity'::timestamptz), '[)') with &&);

-- ---------------------------------------------------------------------------
-- Integridad: solo se asigna a un proyecto a quien pertenece a la compañía del proyecto.
-- ---------------------------------------------------------------------------
create or replace function public._tr_asignacion_valida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from proyectos where id = new.proyecto_id and empresa_id = new.empresa_id) then
    raise exception 'El proyecto no pertenece a esa compañía';
  end if;
  if not exists (select 1 from perfil_empresas where perfil_id = new.perfil_id and empresa_id = new.empresa_id) then
    raise exception 'La persona no pertenece a la compañía de este proyecto';
  end if;
  return new;
end $$;
revoke all on function public._tr_asignacion_valida() from public, anon, authenticated;
create trigger asignacion_valida_trabajador before insert or update on public.proyecto_trabajadores
  for each row execute function public._tr_asignacion_valida();
create trigger asignacion_valida_supervisor before insert or update on public.proyecto_supervisores
  for each row execute function public._tr_asignacion_valida();

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke all on function public._tr_perfil_membresia() from public, anon, authenticated;
revoke all on function public.es_miembro(uuid, uuid) from public, anon;
revoke all on function public.puedo_administrar(uuid) from public, anon;
revoke all on function public.mis_empresas() from public, anon;
revoke all on function public.elegir_empresa(uuid) from public, anon;
revoke all on function public.compartir_trabajador(uuid, uuid, numeric) from public, anon;
revoke all on function public.quitar_de_empresa(uuid) from public, anon;
revoke all on function public.registrar_gasto(uuid, text, numeric, date, text, text) from public, anon;
revoke all on function public.anular_gasto(uuid, text) from public, anon;
revoke all on function public.resumen_empresas(date, date) from public, anon;
grant execute on function public.es_miembro(uuid, uuid), public.puedo_administrar(uuid), public.mis_empresas(),
  public.elegir_empresa(uuid), public.compartir_trabajador(uuid, uuid, numeric), public.quitar_de_empresa(uuid),
  public.registrar_gasto(uuid, text, numeric, date, text, text), public.anular_gasto(uuid, text),
  public.resumen_empresas(date, date)
to authenticated;
revoke all on function public.avisar_remesas(timestamptz) from public, anon, authenticated;
revoke all on function public.avisar_pendientes(timestamptz) from public, anon, authenticated;

