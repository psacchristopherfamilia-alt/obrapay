-- ObraPay · Aprobación automática de lo que termina antes de la hora extra, y ajustes de todas las compañías del trabajador.
--   Un turno queda "por aprobar" solo si tiene minutos después de la hora extra (por defecto, 5:00 p.m.) o si se marcó
--   fuera del área del proyecto. Lo demás queda aprobado al marcar salida, sin aprobador.

create or replace function public._requiere_aprobacion(p_empresa uuid, p_entrada timestamptz, p_salida timestamptz, p_fuera boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_fuera, false) or coalesce((
    select m.min_extra > 0
    from empresas e, lateral public.minutos_turno(p_entrada, p_salida, e.zona_horaria, e.hora_extra_desde, e.almuerzo_inicio, e.almuerzo_fin) m
    where e.id = p_empresa), true)
$$;
revoke all on function public._requiere_aprobacion(uuid, timestamptz, timestamptz, boolean) from public, anon, authenticated;

create or replace function public.marcar_salida(
  p_lat double precision default null, p_lng double precision default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  t turnos;
  v_fuera boolean;
  v_salida timestamptz;
  v_pendiente boolean;
begin
  select * into t from turnos where perfil_id = auth.uid() and salida is null for update;
  if not found then raise exception 'No tienes un turno abierto'; end if;
  v_fuera := t.fuera_de_area or public._revisar_gps(t.empresa_id, t.proyecto_id, p_lat, p_lng);
  v_salida := greatest(now(), t.entrada + interval '1 second');
  v_pendiente := public._requiere_aprobacion(t.empresa_id, t.entrada, v_salida, v_fuera);
  update turnos
     set salida = v_salida, salida_lat = p_lat, salida_lng = p_lng, fuera_de_area = v_fuera,
         estado = case when v_pendiente then 'por_aprobar' else 'aprobado' end,
         aprobado_en = case when v_pendiente then null else now() end
   where id = t.id;
  return t.id;
end $$;

-- Ajustes de cada compañía donde la persona trabaja (para calcular horas y pedir GPS según el proyecto, sin cambiar de compañía).
create or replace function public.mis_ajustes_empresas()
returns table (empresa_id uuid, zona_horaria text, hora_extra_desde time, almuerzo_inicio time, almuerzo_fin time, gps_activo boolean, gps_modo text)
language sql stable security definer set search_path = public as $$
  select e.id, e.zona_horaria, e.hora_extra_desde, e.almuerzo_inicio, e.almuerzo_fin, e.gps_activo, e.gps_modo
  from empresas e
  join perfil_empresas m on m.empresa_id = e.id and m.perfil_id = auth.uid() and m.baja_en is null
  where exists (select 1 from perfiles where id = auth.uid() and activo)
$$;
revoke all on function public.mis_ajustes_empresas() from public, anon;
grant execute on function public.mis_ajustes_empresas() to authenticated;
