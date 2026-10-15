-- Marcas hechas sin conexión: la entrada o salida guarda la hora real del teléfono (p_hora) y una clave para reintentar sin duplicar (p_clave).
-- Una marca enviada con más de 5 minutos de retraso queda como "diferida": el turno entero espera la aprobación del supervisor.
alter table public.turnos
  add column if not exists marca_diferida boolean not null default false,
  add column if not exists clave_entrada uuid,
  add column if not exists clave_salida uuid;
create unique index if not exists turnos_clave_entrada_uq on public.turnos (perfil_id, clave_entrada) where clave_entrada is not null;
create unique index if not exists turnos_clave_salida_uq on public.turnos (perfil_id, clave_salida) where clave_salida is not null;

drop function if exists public.marcar_entrada(uuid, double precision, double precision);
drop function if exists public.marcar_salida(double precision, double precision);

create function public.marcar_entrada(
  p_proyecto uuid, p_lat double precision default null, p_lng double precision default null,
  p_hora timestamptz default null, p_clave uuid default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  yo perfiles;
  v_emp uuid;
  v_tz text;
  v_fuera boolean;
  v_id uuid;
  v_hora timestamptz := now();
  v_dif boolean := false;
begin
  select * into yo from perfiles where id = auth.uid() and activo;
  if not found then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not ('trabajador' = any (yo.roles)) then
    raise exception 'Tu usuario no marca horas';
  end if;
  -- Reintento de una marca que ya se guardó: devuelve el mismo turno.
  if p_clave is not null then
    select id into v_id from turnos where perfil_id = yo.id and clave_entrada = p_clave;
    if found then return v_id; end if;
  end if;
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
  if p_hora is not null then
    if p_hora > now() + interval '2 minutes' then
      raise exception 'La hora de la marca está en el futuro; revisa la hora de tu teléfono';
    end if;
    if p_hora < now() - interval '72 hours' then
      raise exception 'La marca tiene más de 3 días; pídele a tu supervisor que la registre';
    end if;
    if exists (select 1 from turnos where perfil_id = yo.id and salida > p_hora) then
      raise exception 'La marca se cruza con otro turno tuyo; habla con tu supervisor';
    end if;
    v_hora := least(p_hora, now());
    v_dif := (now() - v_hora) > interval '5 minutes';
  end if;

  v_fuera := public._revisar_gps(v_emp, p_proyecto, p_lat, p_lng);
  select zona_horaria into v_tz from empresas where id = v_emp;
  perform public.asegurar_semana(v_emp, (v_hora at time zone v_tz)::date);

  insert into turnos (empresa_id, perfil_id, proyecto_id, entrada, entrada_lat, entrada_lng, fuera_de_area, marca_diferida, clave_entrada)
  values (v_emp, yo.id, p_proyecto, v_hora, p_lat, p_lng, v_fuera, v_dif, p_clave)
  returning id into v_id;
  return v_id;
end $fn$;

create function public.marcar_salida(
  p_lat double precision default null, p_lng double precision default null,
  p_hora timestamptz default null, p_clave uuid default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  t turnos;
  v_id uuid;
  v_fuera boolean;
  v_salida timestamptz := now();
  v_dif boolean := false;
  v_pendiente boolean;
begin
  select * into t from turnos where perfil_id = auth.uid() and salida is null for update;
  if not found then
    if p_clave is not null then
      select id into v_id from turnos where perfil_id = auth.uid() and clave_salida = p_clave;
      if found then return v_id; end if;
    end if;
    raise exception 'No tienes un turno abierto';
  end if;
  if p_hora is not null then
    if p_hora > now() + interval '2 minutes' then
      raise exception 'La hora de la marca está en el futuro; revisa la hora de tu teléfono';
    end if;
    v_salida := least(p_hora, now());
    v_dif := (now() - v_salida) > interval '5 minutes';
  end if;
  v_fuera := t.fuera_de_area or public._revisar_gps(t.empresa_id, t.proyecto_id, p_lat, p_lng);
  v_salida := greatest(v_salida, t.entrada + interval '1 second');
  v_pendiente := public._requiere_aprobacion(t.empresa_id, t.entrada, v_salida, v_fuera) or v_dif or t.marca_diferida;
  update turnos
     set salida = v_salida, salida_lat = p_lat, salida_lng = p_lng, fuera_de_area = v_fuera,
         marca_diferida = t.marca_diferida or v_dif, clave_salida = p_clave,
         estado = case when v_pendiente then 'por_aprobar' else 'aprobado' end,
         aprobado_en = case when v_pendiente then null else now() end
   where id = t.id;
  return t.id;
end $fn$;

revoke all on function public.marcar_entrada(uuid, double precision, double precision, timestamptz, uuid) from public, anon;
revoke all on function public.marcar_salida(double precision, double precision, timestamptz, uuid) from public, anon;
grant execute on function public.marcar_entrada(uuid, double precision, double precision, timestamptz, uuid) to authenticated;
grant execute on function public.marcar_salida(double precision, double precision, timestamptz, uuid) to authenticated;
