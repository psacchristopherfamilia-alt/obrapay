-- Vencimientos de documentos y vehículos.
--   · Documentos de personas y compañía: permiso de trabajo, licencia de construcción, licencia de conducir.
--   · Vehículos: ficha, conductor asignado, millas, seguro, inspección y registro (documentos del vehículo)
--     y planes de mantenimiento por millas o por fecha (lo que ocurra primero) con historial de servicios.
--   · Cada documento guarda su fecha y su archivo (PDF o foto) en un depósito privado.
--   · Avisos al admin dentro de la app, cada día, hasta que se renueve o se registre el servicio:
--       permiso de trabajo y licencia de construcción 90 días antes; los demás documentos 30 días antes;
--       mantenimiento 15 días antes (por fecha) o 500 millas antes (por millas).
--   · Renovar = documento nuevo; el anterior queda inactivo (el historial no se borra).
--   · Las millas las actualiza el admin o el conductor asignado al vehículo.

create table public.vehiculos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  nombre         text not null check (length(trim(nombre)) > 0),
  placa          text,
  tipo           text not null default 'camioneta' check (tipo in ('camioneta', 'van', 'camion', 'remolque', 'otro')),
  marca          text,
  modelo         text,
  anio           integer check (anio between 1950 and 2100),
  vin            text,
  foto_path      text,
  foto_nombre    text,
  conductor_id   uuid references public.perfiles (id) on delete set null,
  millas         integer not null default 0 check (millas >= 0),
  millas_en      timestamptz not null default now(),
  activo         boolean not null default true,
  creado_por     uuid references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
create index vehiculos_empresa_idx on public.vehiculos (empresa_id, activo);
create index vehiculos_conductor_idx on public.vehiculos (conductor_id) where activo;
create unique index vehiculos_placa_uq on public.vehiculos (empresa_id, upper(trim(placa))) where activo and nullif(trim(placa), '') is not null;

create table public.vehiculo_planes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  vehiculo_id    uuid not null references public.vehiculos (id) on delete cascade,
  nombre         text not null check (length(trim(nombre)) > 0),
  cada_millas    integer check (cada_millas > 0),
  cada_dias      integer check (cada_dias > 0),
  ultimo_fecha   date not null,
  ultimo_millas  integer not null check (ultimo_millas >= 0),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  check (cada_millas is not null or cada_dias is not null)
);
create index vehiculo_planes_idx on public.vehiculo_planes (vehiculo_id, activo);

create table public.vehiculo_servicios (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  vehiculo_id    uuid not null references public.vehiculos (id) on delete cascade,
  plan_id        uuid references public.vehiculo_planes (id) on delete set null,
  nombre         text not null,
  fecha          date not null,
  millas         integer not null check (millas >= 0),
  costo          numeric(12, 2) check (costo is null or costo >= 0),
  notas          text,
  creado_por     uuid references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
create index vehiculo_servicios_idx on public.vehiculo_servicios (vehiculo_id, fecha desc);

alter table public.vehiculos enable row level security;
alter table public.vehiculo_planes enable row level security;
alter table public.vehiculo_servicios enable row level security;
revoke all on public.vehiculos, public.vehiculo_planes, public.vehiculo_servicios from anon, authenticated;
grant select on public.vehiculos, public.vehiculo_planes, public.vehiculo_servicios to authenticated;
-- Gerencia ve los vehículos de su compañía; el conductor asignado ve el suyo y sus planes (no el costo de los servicios).
create policy vehiculos_ver on public.vehiculos for select to authenticated
  using ((empresa_id = public.mi_empresa() and public.es_gerencia()) or (conductor_id = auth.uid() and activo));
create policy vehiculo_planes_ver on public.vehiculo_planes for select to authenticated
  using ((empresa_id = public.mi_empresa() and public.es_gerencia())
      or exists (select 1 from public.vehiculos v where v.id = vehiculo_id and v.conductor_id = auth.uid() and v.activo));
create policy vehiculo_servicios_ver on public.vehiculo_servicios for select to authenticated
  using (empresa_id = public.mi_empresa() and public.es_gerencia());

create table public.documentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  tipo           text not null check (tipo in ('permiso_trabajo', 'licencia_construccion', 'licencia_conducir', 'seguro_vehiculo', 'inspeccion_vehiculo', 'registro_vehiculo')),
  perfil_id      uuid references public.perfiles (id) on delete set null,
  vehiculo_id    uuid references public.vehiculos (id) on delete cascade,
  titulo         text,
  numero         text,
  vence          date not null,
  archivo_path   text,
  archivo_nombre text,
  activo         boolean not null default true,
  reemplaza_id   uuid references public.documentos (id),
  creado_por     uuid references public.perfiles (id),
  creado_en      timestamptz not null default now(),
  check (tipo not in ('permiso_trabajo', 'licencia_conducir') or perfil_id is not null),
  check (tipo not in ('seguro_vehiculo', 'inspeccion_vehiculo', 'registro_vehiculo') or vehiculo_id is not null)
);
create index documentos_empresa_idx on public.documentos (empresa_id, activo, vence);
create unique index documentos_vehiculo_tipo_uq on public.documentos (vehiculo_id, tipo) where activo and vehiculo_id is not null;

alter table public.documentos enable row level security;
revoke all on public.documentos from anon, authenticated;
grant select on public.documentos to authenticated;
create policy documentos_ver on public.documentos for select to authenticated
  using (empresa_id = public.mi_empresa() and public.es_gerencia());

-- "Nombre · PLACA" para avisos y listas.
create or replace function public._etiqueta_vehiculo(v public.vehiculos) returns text
language sql immutable as $$
  select v.nombre || coalesce(' · ' || nullif(trim(v.placa), ''), '')
$$;

-- Cuántos días antes empieza el aviso.
create or replace function public._ventana_documento(p_tipo text) returns integer
language sql immutable as $$
  select case when p_tipo in ('permiso_trabajo', 'licencia_construccion') then 90 else 30 end
$$;

-- Aviso (uno por documento y por admin): se vuelve a poner sin leer cada día hasta que se renueve.
create or replace function public._aviso_documento(p_doc uuid, p_hoy date) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos; v_quien text; v_dias integer;
begin
  select * into d from documentos where id = p_doc;
  if not found then return; end if;
  delete from notificaciones where tipo = 'documento_por_vencer' and datos ->> 'documento' = p_doc::text;
  if not d.activo then return; end if;
  v_dias := d.vence - p_hoy;
  if v_dias > public._ventana_documento(d.tipo) then return; end if;
  v_quien := case d.tipo
    when 'permiso_trabajo' then (select nombre from perfiles where id = d.perfil_id)
    when 'licencia_conducir' then (select nombre from perfiles where id = d.perfil_id)
    when 'licencia_construccion' then coalesce(nullif(trim(d.titulo), ''), (select nombre from empresas where id = d.empresa_id))
    when 'seguro_vehiculo' then (select public._etiqueta_vehiculo(v) from vehiculos v where v.id = d.vehiculo_id)
    when 'inspeccion_vehiculo' then (select public._etiqueta_vehiculo(v) from vehiculos v where v.id = d.vehiculo_id)
    when 'registro_vehiculo' then (select public._etiqueta_vehiculo(v) from vehiculos v where v.id = d.vehiculo_id)
    else d.titulo end;
  insert into notificaciones (empresa_id, perfil_id, tipo, datos)
  select d.empresa_id, p.id, 'documento_por_vencer',
         jsonb_build_object('documento', d.id, 'doc_tipo', d.tipo, 'quien', coalesce(v_quien, ''), 'vence', d.vence, 'dias', v_dias, 'vehiculo', d.vehiculo_id)
    from perfiles p
   where p.activo and 'admin' = any (p.roles) and public.es_miembro(p.id, d.empresa_id);
end $$;
revoke all on function public._aviso_documento(uuid, date) from public, anon, authenticated;

-- Corre cada día (cron). Devuelve cuántos documentos están dentro de su ventana de aviso.
create or replace function public.avisar_documentos(p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d record; n integer := 0;
begin
  for d in
    select x.id, (p_ahora at time zone e.zona_horaria)::date as hoy, x.vence, x.tipo
      from documentos x join empresas e on e.id = x.empresa_id
     where x.activo
  loop
    perform public._aviso_documento(d.id, d.hoy);
    if d.vence - d.hoy <= public._ventana_documento(d.tipo) then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.avisar_documentos(timestamptz) from public, anon, authenticated;

create or replace function public._hoy_empresa(p_empresa uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone zona_horaria)::date from empresas where id = p_empresa
$$;
revoke all on function public._hoy_empresa(uuid) from public, anon, authenticated;

-- Guardar o corregir un documento (solo admin).
create or replace function public.guardar_documento(
  p_id uuid, p_tipo text, p_perfil uuid, p_titulo text, p_numero text, p_vence date,
  p_archivo_path text default null, p_archivo_nombre text default null, p_vehiculo uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_id uuid := p_id;
begin
  if not public.tengo_rol('admin') or v_emp is null then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  if p_vence is null then raise exception 'Falta la fecha de vencimiento'; end if;
  if p_tipo in ('permiso_trabajo', 'licencia_conducir') then
    if p_perfil is null or not public.es_miembro(p_perfil, v_emp) then
      raise exception 'Elige un trabajador de esta compañía';
    end if;
  end if;
  if p_tipo in ('seguro_vehiculo', 'inspeccion_vehiculo', 'registro_vehiculo') then
    if p_vehiculo is null or not exists (select 1 from vehiculos where id = p_vehiculo and empresa_id = v_emp and activo) then
      raise exception 'Elige un vehículo de esta compañía';
    end if;
    if exists (select 1 from documentos where vehiculo_id = p_vehiculo and tipo = p_tipo and activo and id is distinct from p_id) then
      raise exception 'Este vehículo ya tiene ese documento: usa Renovar';
    end if;
  else
    p_vehiculo := null;
  end if;
  if p_archivo_path is not null and split_part(p_archivo_path, '/', 1) <> v_emp::text then
    raise exception 'Archivo inválido';
  end if;
  if v_id is null then
    insert into documentos (empresa_id, tipo, perfil_id, vehiculo_id, titulo, numero, vence, archivo_path, archivo_nombre, creado_por)
    values (v_emp, p_tipo, p_perfil, p_vehiculo, nullif(trim(p_titulo), ''), nullif(trim(p_numero), ''), p_vence, p_archivo_path, p_archivo_nombre, auth.uid())
    returning id into v_id;
  else
    update documentos set tipo = p_tipo, perfil_id = p_perfil, vehiculo_id = p_vehiculo, titulo = nullif(trim(p_titulo), ''), numero = nullif(trim(p_numero), ''),
           vence = p_vence, archivo_path = coalesce(p_archivo_path, archivo_path), archivo_nombre = coalesce(p_archivo_nombre, archivo_nombre)
     where id = v_id and empresa_id = v_emp and activo;
    if not found then raise exception 'Documento no encontrado'; end if;
  end if;
  perform public._aviso_documento(v_id, public._hoy_empresa(v_emp));
  return v_id;
end $$;

-- Renovar: crea el documento nuevo y deja el anterior inactivo.
create or replace function public.renovar_documento(
  p_id uuid, p_vence date, p_numero text default null, p_archivo_path text default null, p_archivo_nombre text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); d documentos; v_id uuid;
begin
  if not public.tengo_rol('admin') or v_emp is null then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  select * into d from documentos where id = p_id and empresa_id = v_emp and activo for update;
  if not found then raise exception 'Documento no encontrado'; end if;
  if p_vence is null or p_vence <= d.vence then raise exception 'La nueva fecha debe ser posterior a la anterior'; end if;
  if p_archivo_path is not null and split_part(p_archivo_path, '/', 1) <> v_emp::text then
    raise exception 'Archivo inválido';
  end if;
  update documentos set activo = false where id = d.id;
  insert into documentos (empresa_id, tipo, perfil_id, vehiculo_id, titulo, numero, vence, archivo_path, archivo_nombre, reemplaza_id, creado_por)
  values (v_emp, d.tipo, d.perfil_id, d.vehiculo_id, d.titulo, coalesce(nullif(trim(p_numero), ''), d.numero), p_vence,
          coalesce(p_archivo_path, d.archivo_path), coalesce(p_archivo_nombre, d.archivo_nombre), d.id, auth.uid())
  returning id into v_id;
  perform public._aviso_documento(d.id, public._hoy_empresa(v_emp));   -- borra el aviso del documento anterior
  perform public._aviso_documento(v_id, public._hoy_empresa(v_emp));
  return v_id;
end $$;

-- Quitar un documento (queda inactivo, no se borra).
create or replace function public.quitar_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa();
begin
  if not public.tengo_rol('admin') or v_emp is null then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  update documentos set activo = false where id = p_id and empresa_id = v_emp and activo;
  if not found then raise exception 'Documento no encontrado'; end if;
  perform public._aviso_documento(p_id, public._hoy_empresa(v_emp));
end $$;

revoke all on function public.guardar_documento(uuid, text, uuid, text, text, date, text, text, uuid) from public, anon;
revoke all on function public.renovar_documento(uuid, date, text, text, text) from public, anon;
revoke all on function public.quitar_documento(uuid) from public, anon;
grant execute on function public.guardar_documento(uuid, text, uuid, text, text, date, text, text, uuid) to authenticated;
grant execute on function public.renovar_documento(uuid, date, text, text, text) to authenticated;
grant execute on function public.quitar_documento(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Vehículos: avisos de mantenimiento
-- ---------------------------------------------------------------------------
-- Un aviso por plan y por admin. Avisa 15 días antes (por fecha) o 500 millas antes (por millas); si ya pasó, sigue.
create or replace function public._aviso_plan(p_plan uuid, p_hoy date) returns void
language plpgsql security definer set search_path = public as $$
declare
  pl vehiculo_planes; v vehiculos;
  v_dias integer; v_rest integer; v_tf boolean := false; v_tm boolean := false; v_rf numeric; v_rm numeric; v_por text;
begin
  select * into pl from vehiculo_planes where id = p_plan;
  if not found then return; end if;
  delete from notificaciones where tipo = 'mantenimiento_vehiculo' and datos ->> 'plan' = p_plan::text;
  select * into v from vehiculos where id = pl.vehiculo_id;
  if not pl.activo or not v.activo then return; end if;
  if pl.cada_dias is not null then
    v_dias := (pl.ultimo_fecha + pl.cada_dias) - p_hoy;
    v_tf := v_dias <= 15;
    v_rf := v_dias::numeric / pl.cada_dias;
  end if;
  if pl.cada_millas is not null then
    v_rest := pl.ultimo_millas + pl.cada_millas - v.millas;
    v_tm := v_rest <= 500;
    v_rm := v_rest::numeric / pl.cada_millas;
  end if;
  if not (v_tf or v_tm) then return; end if;
  v_por := case when v_tf and (not v_tm or v_rf <= v_rm) then 'fecha' else 'millas' end;
  insert into notificaciones (empresa_id, perfil_id, tipo, datos)
  select pl.empresa_id, p.id, 'mantenimiento_vehiculo',
         jsonb_build_object('plan', pl.id, 'vehiculo', v.id, 'servicio', pl.nombre, 'quien', public._etiqueta_vehiculo(v),
                            'por', v_por, 'dias', v_dias, 'millas', v_rest)
    from perfiles p
   where p.activo and 'admin' = any (p.roles) and public.es_miembro(p.id, pl.empresa_id);
end $$;
revoke all on function public._aviso_plan(uuid, date) from public, anon, authenticated;

-- Corre cada día (cron). Devuelve cuántos planes están dentro de su ventana de aviso.
create or replace function public.avisar_vehiculos(p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare x record; n integer := 0;
begin
  for x in
    select pl.id, (p_ahora at time zone e.zona_horaria)::date as hoy,
           (pl.cada_dias is not null and (pl.ultimo_fecha + pl.cada_dias) - (p_ahora at time zone e.zona_horaria)::date <= 15)
        or (pl.cada_millas is not null and pl.ultimo_millas + pl.cada_millas - v.millas <= 500) as dentro
      from vehiculo_planes pl
      join vehiculos v on v.id = pl.vehiculo_id
      join empresas e on e.id = pl.empresa_id
     where pl.activo and v.activo
  loop
    perform public._aviso_plan(x.id, x.hoy);
    if x.dentro then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.avisar_vehiculos(timestamptz) from public, anon, authenticated;

-- Vuelve a calcular todos los avisos de un vehículo (millas nuevas, planes o documentos que cambian).
create or replace function public._reavisar_vehiculo(p_vehiculo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare x record; v_hoy date;
begin
  select public._hoy_empresa(empresa_id) into v_hoy from vehiculos where id = p_vehiculo;
  for x in select id from vehiculo_planes where vehiculo_id = p_vehiculo loop perform public._aviso_plan(x.id, v_hoy); end loop;
  for x in select id from documentos where vehiculo_id = p_vehiculo loop perform public._aviso_documento(x.id, v_hoy); end loop;
end $$;
revoke all on function public._reavisar_vehiculo(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vehículos: acciones
-- ---------------------------------------------------------------------------
create or replace function public.guardar_vehiculo(
  p_id uuid, p_nombre text, p_placa text, p_tipo text, p_marca text, p_modelo text, p_anio integer, p_vin text,
  p_conductor uuid, p_millas integer default null, p_foto_path text default null, p_foto_nombre text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_id uuid := p_id;
begin
  if not public.tengo_rol('admin') or v_emp is null then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  if nullif(trim(p_nombre), '') is null then raise exception 'Escribe el nombre del vehículo'; end if;
  if p_conductor is not null and not public.es_miembro(p_conductor, v_emp) then
    raise exception 'Elige un conductor de esta compañía';
  end if;
  if p_foto_path is not null and split_part(p_foto_path, '/', 1) <> v_emp::text then raise exception 'Archivo inválido'; end if;
  if nullif(trim(p_placa), '') is not null and exists (
    select 1 from vehiculos where empresa_id = v_emp and activo and upper(trim(placa)) = upper(trim(p_placa)) and id is distinct from p_id
  ) then raise exception 'Ya hay un vehículo con esa placa'; end if;
  if v_id is null then
    insert into vehiculos (empresa_id, nombre, placa, tipo, marca, modelo, anio, vin, conductor_id, millas, foto_path, foto_nombre, creado_por)
    values (v_emp, trim(p_nombre), nullif(trim(p_placa), ''), coalesce(nullif(p_tipo, ''), 'camioneta'), nullif(trim(p_marca), ''), nullif(trim(p_modelo), ''),
            p_anio, nullif(trim(p_vin), ''), p_conductor, coalesce(p_millas, 0), p_foto_path, p_foto_nombre, auth.uid())
    returning id into v_id;
  else
    update vehiculos set nombre = trim(p_nombre), placa = nullif(trim(p_placa), ''), tipo = coalesce(nullif(p_tipo, ''), tipo),
           marca = nullif(trim(p_marca), ''), modelo = nullif(trim(p_modelo), ''), anio = p_anio, vin = nullif(trim(p_vin), ''),
           conductor_id = p_conductor, foto_path = coalesce(p_foto_path, foto_path), foto_nombre = coalesce(p_foto_nombre, foto_nombre)
     where id = v_id and empresa_id = v_emp and activo;
    if not found then raise exception 'Vehículo no encontrado'; end if;
    perform public._reavisar_vehiculo(v_id);   -- cambia el nombre que sale en los avisos
  end if;
  return v_id;
end $$;

-- Quitar un vehículo: queda inactivo con sus planes y documentos (el historial no se borra) y se limpian sus avisos.
create or replace function public.quitar_vehiculo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa();
begin
  if not public.tengo_rol('admin') or v_emp is null then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  update vehiculos set activo = false where id = p_id and empresa_id = v_emp and activo;
  if not found then raise exception 'Vehículo no encontrado'; end if;
  update vehiculo_planes set activo = false where vehiculo_id = p_id;
  update documentos set activo = false where vehiculo_id = p_id;
  perform public._reavisar_vehiculo(p_id);
end $$;

-- Millas del odómetro: las puede actualizar el admin o el conductor asignado. Solo el admin puede corregirlas a la baja.
create or replace function public.actualizar_millas(p_vehiculo uuid, p_millas integer) returns void
language plpgsql security definer set search_path = public as $$
declare v vehiculos; v_admin boolean;
begin
  if public.mi_empresa() is null then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  select * into v from vehiculos where id = p_vehiculo and activo for update;
  if not found then raise exception 'Vehículo no encontrado'; end if;
  v_admin := public.tengo_rol('admin') and v.empresa_id = public.mi_empresa();
  if not v_admin and v.conductor_id is distinct from auth.uid() then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  if p_millas is null or p_millas < 0 or p_millas > 2000000 then raise exception 'Escribe las millas que marca el odómetro'; end if;
  if p_millas < v.millas and not v_admin then
    raise exception 'Las millas no pueden ser menores a las ya registradas (%)', v.millas;
  end if;
  update vehiculos set millas = p_millas, millas_en = now() where id = v.id;
  perform public._reavisar_vehiculo(v.id);
end $$;

-- Plan de mantenimiento (por millas, por días o ambos: avisa lo que ocurra primero).
create or replace function public.guardar_plan(
  p_id uuid, p_vehiculo uuid, p_nombre text, p_cada_millas integer, p_cada_dias integer,
  p_ultimo_fecha date default null, p_ultimo_millas integer default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v vehiculos; v_id uuid := p_id;
begin
  if not public.tengo_rol('admin') or v_emp is null then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  select * into v from vehiculos where id = p_vehiculo and empresa_id = v_emp and activo;
  if not found then raise exception 'Vehículo no encontrado'; end if;
  if nullif(trim(p_nombre), '') is null then raise exception 'Escribe el nombre del servicio'; end if;
  if p_cada_millas is null and p_cada_dias is null then raise exception 'Indica cada cuántas millas o cada cuántos días'; end if;
  if v_id is null then
    insert into vehiculo_planes (empresa_id, vehiculo_id, nombre, cada_millas, cada_dias, ultimo_fecha, ultimo_millas)
    values (v_emp, v.id, trim(p_nombre), p_cada_millas, p_cada_dias, coalesce(p_ultimo_fecha, public._hoy_empresa(v_emp)), coalesce(p_ultimo_millas, v.millas))
    returning id into v_id;
  else
    update vehiculo_planes set nombre = trim(p_nombre), cada_millas = p_cada_millas, cada_dias = p_cada_dias,
           ultimo_fecha = coalesce(p_ultimo_fecha, ultimo_fecha), ultimo_millas = coalesce(p_ultimo_millas, ultimo_millas)
     where id = v_id and vehiculo_id = v.id and activo;
    if not found then raise exception 'Plan no encontrado'; end if;
  end if;
  perform public._aviso_plan(v_id, public._hoy_empresa(v_emp));
  return v_id;
end $$;

create or replace function public.quitar_plan(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa();
begin
  if not public.tengo_rol('admin') or v_emp is null then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  update vehiculo_planes set activo = false where id = p_id and empresa_id = v_emp and activo;
  if not found then raise exception 'Plan no encontrado'; end if;
  perform public._aviso_plan(p_id, public._hoy_empresa(v_emp));
end $$;

-- Registrar un servicio hecho: guarda el historial y reinicia los contadores del plan.
create or replace function public.registrar_servicio(
  p_plan uuid, p_fecha date default null, p_millas integer default null, p_costo numeric default null, p_notas text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); pl vehiculo_planes; v vehiculos; v_fecha date; v_millas integer; v_id uuid;
begin
  if not public.tengo_rol('admin') or v_emp is null then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  select * into pl from vehiculo_planes where id = p_plan and empresa_id = v_emp and activo for update;
  if not found then raise exception 'Plan no encontrado'; end if;
  select * into v from vehiculos where id = pl.vehiculo_id for update;
  v_fecha := coalesce(p_fecha, public._hoy_empresa(v_emp));
  v_millas := coalesce(p_millas, v.millas);
  if v_fecha > public._hoy_empresa(v_emp) then raise exception 'La fecha del servicio no puede ser futura'; end if;
  if v_millas < 0 or v_millas > 2000000 then raise exception 'Escribe las millas que marca el odómetro'; end if;
  if p_costo is not null and p_costo < 0 then raise exception 'El costo no puede ser negativo'; end if;
  insert into vehiculo_servicios (empresa_id, vehiculo_id, plan_id, nombre, fecha, millas, costo, notas, creado_por)
  values (v_emp, v.id, pl.id, pl.nombre, v_fecha, v_millas, p_costo, nullif(trim(p_notas), ''), auth.uid())
  returning id into v_id;
  update vehiculo_planes set ultimo_fecha = v_fecha, ultimo_millas = v_millas where id = pl.id;
  if v_millas > v.millas then update vehiculos set millas = v_millas, millas_en = now() where id = v.id; end if;
  perform public._reavisar_vehiculo(v.id);
  return v_id;
end $$;

revoke all on function public.guardar_vehiculo(uuid, text, text, text, text, text, integer, text, uuid, integer, text, text) from public, anon;
revoke all on function public.quitar_vehiculo(uuid) from public, anon;
revoke all on function public.actualizar_millas(uuid, integer) from public, anon;
revoke all on function public.guardar_plan(uuid, uuid, text, integer, integer, date, integer) from public, anon;
revoke all on function public.quitar_plan(uuid) from public, anon;
revoke all on function public.registrar_servicio(uuid, date, integer, numeric, text) from public, anon;
grant execute on function public.guardar_vehiculo(uuid, text, text, text, text, text, integer, text, uuid, integer, text, text) to authenticated;
grant execute on function public.quitar_vehiculo(uuid) to authenticated;
grant execute on function public.actualizar_millas(uuid, integer) to authenticated;
grant execute on function public.guardar_plan(uuid, uuid, text, integer, integer, date, integer) to authenticated;
grant execute on function public.quitar_plan(uuid) to authenticated;
grant execute on function public.registrar_servicio(uuid, date, integer, numeric, text) to authenticated;


-- Depósito privado de archivos (solo existe en Supabase). Ruta: <empresa_id>/<archivo>.
do $$ begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('documentos', 'documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    drop policy if exists documentos_archivos_ver on storage.objects;
    drop policy if exists documentos_archivos_subir on storage.objects;
    create policy documentos_archivos_ver on storage.objects for select to authenticated
      using (bucket_id = 'documentos' and public.es_gerencia() and public.es_miembro(auth.uid(), ((storage.foldername(name))[1])::uuid));
    create policy documentos_archivos_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'documentos' and public.tengo_rol('admin') and public.es_miembro(auth.uid(), ((storage.foldername(name))[1])::uuid));
  end if;
end $$;
