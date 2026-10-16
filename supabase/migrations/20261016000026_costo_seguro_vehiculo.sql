-- Costo del seguro de cada vehículo (una póliza por vehículo). El admin escribe el monto, cada cuánto se paga y
-- desde qué fecha cuenta. La app lo reparte por día para sacar el costo por semana y por mes.
-- Gerencia (admin y dueño) lo ve; solo el admin lo cambia. El conductor no lo ve.

create table public.vehiculo_seguro_costo (
  vehiculo_id      uuid primary key references public.vehiculos (id) on delete cascade,
  empresa_id       uuid not null references public.empresas (id),
  monto            numeric(12, 2) not null check (monto > 0),
  frecuencia       text not null check (frecuencia in ('mensual', 'trimestral', 'anual')),
  desde            date not null,
  actualizado_por  uuid references public.perfiles (id),
  actualizado_en   timestamptz not null default now()
);

alter table public.vehiculo_seguro_costo enable row level security;
revoke all on public.vehiculo_seguro_costo from anon, authenticated;
grant select on public.vehiculo_seguro_costo to authenticated;
create policy vehiculo_seguro_costo_ver on public.vehiculo_seguro_costo for select to authenticated
  using (empresa_id = public.mi_empresa() and public.es_gerencia());

-- Guardar o quitar el costo del seguro. Monto vacío o cero lo quita.
create or replace function public.guardar_seguro_vehiculo(
  p_vehiculo uuid, p_monto numeric, p_frecuencia text, p_desde date
) returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_monto numeric := round(coalesce(p_monto, 0), 2);
begin
  if not public.tengo_rol('admin') then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  if not exists (select 1 from vehiculos where id = p_vehiculo and empresa_id = v_emp) then raise exception 'Vehículo no encontrado'; end if;
  if v_monto = 0 then
    delete from vehiculo_seguro_costo where vehiculo_id = p_vehiculo;
  else
    if v_monto < 0 or v_monto > 1000000 then raise exception 'Monto inválido'; end if;
    if p_frecuencia is null or p_frecuencia not in ('mensual', 'trimestral', 'anual') then raise exception 'Elige cada cuánto se paga'; end if;
    if p_desde is null then raise exception 'Falta la fecha desde la que cuenta'; end if;
    insert into vehiculo_seguro_costo (vehiculo_id, empresa_id, monto, frecuencia, desde, actualizado_por, actualizado_en)
    values (p_vehiculo, v_emp, v_monto, p_frecuencia, p_desde, auth.uid(), now())
    on conflict (vehiculo_id) do update
      set monto = excluded.monto, frecuencia = excluded.frecuencia, desde = excluded.desde,
          actualizado_por = auth.uid(), actualizado_en = now();
  end if;
  perform public._evento(v_emp, 'seguro_vehiculo_guardado', jsonb_build_object('vehiculo', p_vehiculo, 'monto', v_monto, 'frecuencia', p_frecuencia));
end $$;
revoke all on function public.guardar_seguro_vehiculo(uuid, numeric, text, date) from public, anon;
grant execute on function public.guardar_seguro_vehiculo(uuid, numeric, text, date) to authenticated;
