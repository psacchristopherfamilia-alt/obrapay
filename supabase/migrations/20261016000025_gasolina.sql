-- Gasolina por vehículo y conductor. El conductor asignado (o el admin) registra el total y sube el recibo (obligatorio);
-- cuenta al instante, sin aprobación. Quien la registró puede corregirla; solo el admin la quita.
-- Las millas del odómetro son opcionales: si son mayores a las del vehículo, las actualizan.

create table public.vehiculo_gasolina (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  vehiculo_id    uuid not null references public.vehiculos (id),
  perfil_id      uuid not null references public.perfiles (id),
  fecha          date not null,
  total          numeric(10, 2) not null check (total > 0),
  millas         integer check (millas is null or millas between 0 and 2000000),
  recibo_path    text not null,
  recibo_nombre  text,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  editado_en     timestamptz
);
create index vehiculo_gasolina_empresa_fecha on public.vehiculo_gasolina (empresa_id, fecha);
create index vehiculo_gasolina_vehiculo_fecha on public.vehiculo_gasolina (vehiculo_id, fecha);

alter table public.vehiculo_gasolina enable row level security;
revoke all on public.vehiculo_gasolina from anon, authenticated;
grant select on public.vehiculo_gasolina to authenticated;
-- Gerencia ve todo; cada quien ve lo que registró.
create policy vehiculo_gasolina_ver on public.vehiculo_gasolina for select to authenticated
  using (empresa_id = public.mi_empresa() and (public.es_gerencia() or perfil_id = auth.uid()));

-- Si las millas son mayores a las del vehículo, las sube y recalcula los avisos de mantenimiento.
create or replace function public._millas_desde_gasolina(p_vehiculo uuid, p_millas integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_millas is null then return; end if;
  update vehiculos set millas = p_millas, millas_en = now() where id = p_vehiculo and millas < p_millas;
  if found then perform public._reavisar_vehiculo(p_vehiculo); end if;
end $$;
revoke all on function public._millas_desde_gasolina(uuid, integer) from public, anon, authenticated;

create or replace function public.registrar_gasolina(
  p_vehiculo uuid, p_total numeric, p_recibo_path text, p_recibo_nombre text,
  p_millas integer default null, p_fecha date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v vehiculos; v_admin boolean; v_fecha date; v_id uuid;
begin
  if v_emp is null then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  select * into v from vehiculos where id = p_vehiculo and empresa_id = v_emp and activo for update;
  if not found then raise exception 'Vehículo no encontrado'; end if;
  v_admin := public.tengo_rol('admin');
  if not v_admin and v.conductor_id is distinct from auth.uid() then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  if p_total is null or p_total <= 0 then raise exception 'Escribe el total que echaste'; end if;
  if p_total > 10000 then raise exception 'El total es demasiado grande'; end if;
  if coalesce(trim(p_recibo_path), '') = '' then raise exception 'El recibo es obligatorio'; end if;
  if split_part(p_recibo_path, '/', 1) <> v_emp::text or split_part(p_recibo_path, '/', 2) <> 'gasolina' then
    raise exception 'Archivo inválido';
  end if;
  v_fecha := coalesce(p_fecha, public._hoy_empresa(v_emp));
  if v_fecha > public._hoy_empresa(v_emp) then raise exception 'La fecha no puede ser futura'; end if;
  if p_millas is not null then
    if p_millas < 0 or p_millas > 2000000 then raise exception 'Escribe las millas que marca el odómetro'; end if;
    if p_millas < v.millas and not v_admin then
      raise exception 'Las millas no pueden ser menores a las ya registradas (%)', v.millas;
    end if;
  end if;
  insert into vehiculo_gasolina (empresa_id, vehiculo_id, perfil_id, fecha, total, millas, recibo_path, recibo_nombre)
  values (v_emp, v.id, auth.uid(), v_fecha, round(p_total, 2), p_millas, p_recibo_path, left(nullif(trim(p_recibo_nombre), ''), 120))
  returning id into v_id;
  perform public._millas_desde_gasolina(v.id, p_millas);
  perform public._evento(v_emp, 'gasolina_registrada', jsonb_build_object('gasolina', v_id, 'vehiculo', v.id, 'total', round(p_total, 2)));
  return v_id;
end $$;

-- Corregir una carga: quien la registró o el admin. Sin recibo nuevo conserva el que ya tiene.
create or replace function public.corregir_gasolina(
  p_id uuid, p_total numeric, p_fecha date, p_millas integer,
  p_recibo_path text default null, p_recibo_nombre text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); g vehiculo_gasolina;
begin
  if v_emp is null then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  select * into g from vehiculo_gasolina where id = p_id and empresa_id = v_emp and activo for update;
  if not found then raise exception 'Carga no encontrada'; end if;
  if not public.tengo_rol('admin') and g.perfil_id is distinct from auth.uid() then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  if p_total is null or p_total <= 0 then raise exception 'Escribe el total que echaste'; end if;
  if p_total > 10000 then raise exception 'El total es demasiado grande'; end if;
  if p_fecha is null or p_fecha > public._hoy_empresa(v_emp) then raise exception 'La fecha no puede ser futura'; end if;
  if p_millas is not null and (p_millas < 0 or p_millas > 2000000) then raise exception 'Escribe las millas que marca el odómetro'; end if;
  if p_recibo_path is not null and (split_part(p_recibo_path, '/', 1) <> v_emp::text or split_part(p_recibo_path, '/', 2) <> 'gasolina') then
    raise exception 'Archivo inválido';
  end if;
  update vehiculo_gasolina
     set total = round(p_total, 2), fecha = p_fecha, millas = p_millas,
         recibo_path = coalesce(p_recibo_path, recibo_path),
         recibo_nombre = case when p_recibo_path is null then recibo_nombre else left(nullif(trim(p_recibo_nombre), ''), 120) end,
         editado_en = now()
   where id = g.id;
  perform public._millas_desde_gasolina(g.vehiculo_id, p_millas);
  perform public._evento(v_emp, 'gasolina_corregida', jsonb_build_object('gasolina', g.id, 'antes', g.total, 'despues', round(p_total, 2)));
end $$;

create or replace function public.quitar_gasolina(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa();
begin
  if not public.tengo_rol('admin') or v_emp is null then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  update vehiculo_gasolina set activo = false, editado_en = now() where id = p_id and empresa_id = v_emp and activo;
  if not found then raise exception 'Carga no encontrada'; end if;
  perform public._evento(v_emp, 'gasolina_quitada', jsonb_build_object('gasolina', p_id));
end $$;

revoke all on function public.registrar_gasolina(uuid, numeric, text, text, integer, date) from public, anon;
revoke all on function public.corregir_gasolina(uuid, numeric, date, integer, text, text) from public, anon;
revoke all on function public.quitar_gasolina(uuid) from public, anon;
grant execute on function public.registrar_gasolina(uuid, numeric, text, text, integer, date) to authenticated;
grant execute on function public.corregir_gasolina(uuid, numeric, date, integer, text, text) to authenticated;
grant execute on function public.quitar_gasolina(uuid) to authenticated;

-- Archivos: el conductor asignado sube sus recibos a <compañía>/gasolina/ y ve solo los suyos.
do $$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists gasolina_recibos_subir on storage.objects;
    drop policy if exists gasolina_recibos_ver on storage.objects;
    create policy gasolina_recibos_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'documentos' and (storage.foldername(name))[2] = 'gasolina'
        and exists (select 1 from public.vehiculos v
                     where v.conductor_id = auth.uid() and v.activo and v.empresa_id::text = (storage.foldername(name))[1]));
    create policy gasolina_recibos_ver on storage.objects for select to authenticated
      using (bucket_id = 'documentos' and exists (select 1 from public.vehiculo_gasolina g
                                                   where g.recibo_path = name and g.perfil_id = auth.uid()));
  end if;
end $$;
