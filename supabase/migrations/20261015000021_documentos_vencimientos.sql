-- Vencimientos de documentos (permiso de trabajo, licencia de construcción, licencia de conducir, seguro de vehículo).
--   · Cada documento guarda su fecha y su archivo (PDF o foto) en un depósito privado.
--   · Avisos al admin dentro de la app: desde 3 meses antes (permiso de trabajo y licencia de construcción)
--     o 1 mes antes (licencia de conducir y seguro de vehículo), cada día, hasta que se renueve. Si ya venció, sigue.
--   · Renovar = documento nuevo; el anterior queda inactivo (el historial no se borra).

create table public.documentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  tipo           text not null check (tipo in ('permiso_trabajo', 'licencia_construccion', 'licencia_conducir', 'seguro_vehiculo')),
  perfil_id      uuid references public.perfiles (id) on delete set null,
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
  check (tipo <> 'seguro_vehiculo' or nullif(trim(titulo), '') is not null)
);
create index documentos_empresa_idx on public.documentos (empresa_id, activo, vence);

alter table public.documentos enable row level security;
revoke all on public.documentos from anon, authenticated;
grant select on public.documentos to authenticated;
create policy documentos_ver on public.documentos for select to authenticated
  using (empresa_id = public.mi_empresa() and public.es_gerencia());

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
    else d.titulo end;
  insert into notificaciones (empresa_id, perfil_id, tipo, datos)
  select d.empresa_id, p.id, 'documento_por_vencer',
         jsonb_build_object('documento', d.id, 'doc_tipo', d.tipo, 'quien', coalesce(v_quien, ''), 'vence', d.vence, 'dias', v_dias)
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
  p_archivo_path text default null, p_archivo_nombre text default null
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
  if p_archivo_path is not null and split_part(p_archivo_path, '/', 1) <> v_emp::text then
    raise exception 'Archivo inválido';
  end if;
  if v_id is null then
    insert into documentos (empresa_id, tipo, perfil_id, titulo, numero, vence, archivo_path, archivo_nombre, creado_por)
    values (v_emp, p_tipo, p_perfil, nullif(trim(p_titulo), ''), nullif(trim(p_numero), ''), p_vence, p_archivo_path, p_archivo_nombre, auth.uid())
    returning id into v_id;
  else
    update documentos set tipo = p_tipo, perfil_id = p_perfil, titulo = nullif(trim(p_titulo), ''), numero = nullif(trim(p_numero), ''),
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
  insert into documentos (empresa_id, tipo, perfil_id, titulo, numero, vence, archivo_path, archivo_nombre, reemplaza_id, creado_por)
  values (v_emp, d.tipo, d.perfil_id, d.titulo, coalesce(nullif(trim(p_numero), ''), d.numero), p_vence,
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

revoke all on function public.guardar_documento(uuid, text, uuid, text, text, date, text, text) from public, anon;
revoke all on function public.renovar_documento(uuid, date, text, text, text) from public, anon;
revoke all on function public.quitar_documento(uuid) from public, anon;
grant execute on function public.guardar_documento(uuid, text, uuid, text, text, date, text, text) to authenticated;
grant execute on function public.renovar_documento(uuid, date, text, text, text) to authenticated;
grant execute on function public.quitar_documento(uuid) to authenticated;

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
