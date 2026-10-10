-- ObraPay · Operaciones (RPC)
-- La app nunca escribe directo en turnos, tarifas, préstamos ni nómina: todo pasa por estas funciones,
-- que revisan el rol de quien llama. Los mensajes de error son para mostrarlos al usuario.

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.distancia_m(
  p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision
) returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  ))
$$;

create or replace function public._exigir_rol(p_rol text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tengo_rol(p_rol) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
end $$;

create or replace function public._evento(p_empresa uuid, p_tipo text, p_detalle jsonb) returns void
language sql security definer set search_path = public as $$
  insert into eventos_admin (empresa_id, tipo, detalle, por) values (p_empresa, p_tipo, p_detalle, auth.uid())
$$;

-- Revisa la ubicación contra el proyecto. Devuelve true si quedó fuera del área (modo "marcar").
create or replace function public._revisar_gps(
  p_empresa uuid, p_proyecto uuid, p_lat double precision, p_lng double precision
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  e empresas;
  p proyectos;
begin
  select * into e from empresas where id = p_empresa;
  if not e.gps_activo then return false; end if;
  if p_lat is null or p_lng is null then
    raise exception 'Activa la ubicación del teléfono para marcar';
  end if;
  select * into p from proyectos where id = p_proyecto;
  if p.lat is null or p.lng is null then return false; end if;
  if public.distancia_m(p_lat, p_lng, p.lat, p.lng) <= p.radio_m then return false; end if;
  if e.gps_modo = 'bloquear' then
    raise exception 'Estás fuera del área del proyecto';
  end if;
  return true;
end $$;

-- Semana actual de quien llama (la crea si no existe).
create or replace function public.semana_actual() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_tz text;
begin
  if v_emp is null then raise exception 'No autorizado' using errcode = '42501'; end if;
  select zona_horaria into v_tz from empresas where id = v_emp;
  return public.asegurar_semana(v_emp, (now() at time zone v_tz)::date);
end $$;

-- ---------------------------------------------------------------------------
-- Reloj del trabajador
-- ---------------------------------------------------------------------------
create or replace function public.marcar_entrada(
  p_proyecto uuid, p_lat double precision default null, p_lng double precision default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  yo perfiles;
  v_fuera boolean;
  v_id uuid;
begin
  select * into yo from perfiles where id = auth.uid() and activo;
  if not found then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not ('trabajador' = any (yo.roles)) then
    raise exception 'Tu usuario no marca horas';
  end if;
  if not exists (
    select 1 from proyecto_trabajadores pt join proyectos p on p.id = pt.proyecto_id
    where pt.proyecto_id = p_proyecto and pt.perfil_id = yo.id and p.activo and p.empresa_id = yo.empresa_id
  ) then
    raise exception 'No estás asignado a este proyecto';
  end if;
  if exists (select 1 from turnos where perfil_id = yo.id and salida is null) then
    raise exception 'Ya tienes un turno abierto; marca salida primero';
  end if;

  v_fuera := public._revisar_gps(yo.empresa_id, p_proyecto, p_lat, p_lng);
  perform public.semana_actual();

  insert into turnos (empresa_id, perfil_id, proyecto_id, entrada, entrada_lat, entrada_lng, fuera_de_area)
  values (yo.empresa_id, yo.id, p_proyecto, now(), p_lat, p_lng, v_fuera)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.marcar_salida(
  p_lat double precision default null, p_lng double precision default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  t turnos;
  v_fuera boolean;
begin
  select * into t from turnos where perfil_id = auth.uid() and salida is null for update;
  if not found then raise exception 'No tienes un turno abierto'; end if;
  v_fuera := public._revisar_gps(t.empresa_id, t.proyecto_id, p_lat, p_lng);
  update turnos
     set salida = greatest(now(), t.entrada + interval '1 second'),
         salida_lat = p_lat, salida_lng = p_lng,
         fuera_de_area = t.fuera_de_area or v_fuera,
         estado = 'por_aprobar'
   where id = t.id;
  return t.id;
end $$;

-- ---------------------------------------------------------------------------
-- Aprobación y corrección
-- Supervisor de ese proyecto → 'aprobado'. Admin → 'aprobado_admin' (queda marcado y el
-- supervisor puede confirmarlo después). Nadie aprueba su propio turno.
-- ---------------------------------------------------------------------------
create or replace function public.aprobar_turnos(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  t turnos;
  v_estado text;
  n integer := 0;
begin
  for t in select * from turnos where id = any (p_ids) and empresa_id = public.mi_empresa() for update loop
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
  select * into t from turnos where id = p_id and empresa_id = public.mi_empresa() for update;
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

-- ---------------------------------------------------------------------------
-- Tarifas y seguro (admin). Un cambio de tarifa notifica al trabajador.
-- ---------------------------------------------------------------------------
create or replace function public.cambiar_tarifa(p_perfil uuid, p_monto numeric, p_desde date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.mi_empresa();
  v_antes numeric;
begin
  perform public._exigir_rol('admin');
  if not exists (select 1 from perfiles where id = p_perfil and empresa_id = v_emp) then
    raise exception 'Trabajador no encontrado';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'La tarifa debe ser mayor que cero'; end if;
  v_antes := public.tarifa_vigente(p_perfil, p_desde);

  insert into tarifas (empresa_id, perfil_id, monto_hora, vigente_desde, creado_por)
  values (v_emp, p_perfil, round(p_monto, 2), p_desde, auth.uid())
  on conflict (perfil_id, vigente_desde) do update set monto_hora = excluded.monto_hora, creado_por = excluded.creado_por;

  if v_antes is distinct from round(p_monto, 2) then
    insert into notificaciones (empresa_id, perfil_id, tipo, datos)
    values (v_emp, p_perfil, 'cambio_tarifa',
            jsonb_build_object('antes', v_antes, 'despues', round(p_monto, 2), 'desde', p_desde));
  end if;
  perform public._evento(v_emp, 'cambio_tarifa',
    jsonb_build_object('perfil', p_perfil, 'antes', v_antes, 'despues', round(p_monto, 2), 'desde', p_desde));
end $$;

create or replace function public.cambiar_seguro(p_perfil uuid, p_porcentaje numeric, p_desde date)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa();
begin
  perform public._exigir_rol('admin');
  if not exists (select 1 from perfiles where id = p_perfil and empresa_id = v_emp) then
    raise exception 'Trabajador no encontrado';
  end if;
  insert into seguros (empresa_id, perfil_id, porcentaje, vigente_desde, creado_por)
  values (v_emp, p_perfil, p_porcentaje, p_desde, auth.uid())
  on conflict (perfil_id, vigente_desde) do update set porcentaje = excluded.porcentaje, creado_por = excluded.creado_por;
  perform public._evento(v_emp, 'cambio_seguro', jsonb_build_object('perfil', p_perfil, 'porcentaje', p_porcentaje, 'desde', p_desde));
end $$;

-- ---------------------------------------------------------------------------
-- Préstamos (admin)
-- ---------------------------------------------------------------------------
create or replace function public.crear_prestamo(p_perfil uuid, p_monto numeric, p_fecha date default current_date, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_id uuid;
begin
  perform public._exigir_rol('admin');
  if not exists (select 1 from perfiles where id = p_perfil and empresa_id = v_emp) then
    raise exception 'Trabajador no encontrado';
  end if;
  insert into prestamos (empresa_id, perfil_id, monto_total, fecha, nota, creado_por)
  values (v_emp, p_perfil, round(p_monto, 2), p_fecha, p_nota, auth.uid())
  returning id into v_id;
  perform public._evento(v_emp, 'prestamo_creado', jsonb_build_object('prestamo', v_id, 'perfil', p_perfil, 'monto', round(p_monto, 2)));
  return v_id;
end $$;

-- Topes: no más que el saldo del préstamo ni más de lo que queda del pago tras seguro y otros préstamos.
create or replace function public.fijar_descuento_prestamo(p_prestamo uuid, p_semana uuid, p_monto numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.mi_empresa();
  pr prestamos;
  s semanas;
  v_saldo numeric;
  v_disponible numeric;
begin
  perform public._exigir_rol('admin');
  select * into pr from prestamos where id = p_prestamo and empresa_id = v_emp;
  if not found then raise exception 'Préstamo no encontrado'; end if;
  select * into s from semanas where id = p_semana and empresa_id = v_emp;
  if not found or s.estado <> 'abierta' then raise exception 'Solo se puede cambiar el descuento de una semana abierta'; end if;
  if p_monto is null or p_monto < 0 then raise exception 'El descuento no puede ser negativo'; end if;

  v_saldo := pr.monto_total - coalesce((select sum(monto) from descuentos_prestamo
                                        where prestamo_id = pr.id and semana_id <> p_semana), 0);
  if round(p_monto, 2) > v_saldo then
    raise exception 'El descuento supera el saldo del préstamo ($%)', to_char(v_saldo, 'FM999999990.00');
  end if;

  select coalesce(c.bruto - c.seguro, 0)
         - coalesce((select sum(d.monto) from descuentos_prestamo d join prestamos p2 on p2.id = d.prestamo_id
                     where d.semana_id = p_semana and p2.perfil_id = pr.perfil_id and d.prestamo_id <> pr.id), 0)
    into v_disponible
    from (select 1) x left join public._calcular_semana(p_semana) c on c.perfil_id = pr.perfil_id;
  if round(p_monto, 2) > coalesce(v_disponible, 0) then
    raise exception 'El descuento deja el pago en negativo (máximo $%)', to_char(greatest(coalesce(v_disponible, 0), 0), 'FM999999990.00');
  end if;

  insert into descuentos_prestamo (empresa_id, prestamo_id, semana_id, monto, creado_por)
  values (v_emp, pr.id, p_semana, round(p_monto, 2), auth.uid())
  on conflict (prestamo_id, semana_id) do update set monto = excluded.monto, creado_por = excluded.creado_por;
end $$;

-- ---------------------------------------------------------------------------
-- Cierres (sistema) y control de semanas (admin)
-- ---------------------------------------------------------------------------
-- Congela la nómina de una semana abierta. Si una corrección posterior dejó un pago en negativo,
-- baja los descuentos de préstamo de ese trabajador hasta dejarlo en cero y lo registra.
create or replace function public._cerrar_semana(p_semana uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s semanas;
  c record;
  d record;
  v_falta numeric;
begin
  select * into s from semanas where id = p_semana for update;
  if not found or s.estado <> 'abierta' then return; end if;

  for c in select * from public._calcular_semana(p_semana) where neto < 0 loop
    v_falta := -c.neto;
    for d in select dp.* from descuentos_prestamo dp join prestamos p on p.id = dp.prestamo_id
             where dp.semana_id = p_semana and p.perfil_id = c.perfil_id order by dp.creado_en desc loop
      exit when v_falta <= 0;
      update descuentos_prestamo set monto = monto - least(monto, v_falta) where id = d.id;
      v_falta := v_falta - least(d.monto, v_falta);
    end loop;
    perform public._evento(s.empresa_id, 'descuento_ajustado_al_cierre',
      jsonb_build_object('semana', p_semana, 'perfil', c.perfil_id, 'ajuste', -c.neto));
  end loop;

  create temp table _incluidos on commit drop as
    select turno_id from public._turnos_semana(p_semana);

  insert into nomina_proyecto (semana_id, empresa_id, perfil_id, proyecto_id, minutos_reg, minutos_extra, bruto)
  select p_semana, s.empresa_id, perfil_id, proyecto_id, minutos_reg, minutos_extra, round(bruto_exacto, 2)
  from public._detalle_semana(p_semana);

  insert into nomina_semanal (semana_id, empresa_id, perfil_id, minutos_reg, minutos_extra, bruto,
                              seguro_pct, seguro, prestamo, neto, con_aprobacion_admin)
  select p_semana, s.empresa_id, perfil_id, minutos_reg, minutos_extra, bruto,
         seguro_pct, seguro, prestamo, neto, con_aprobacion_admin
  from public._calcular_semana(p_semana);

  update turnos set semana_id = p_semana where id in (select turno_id from _incluidos);
  drop table _incluidos;

  update semanas set estado = 'cerrada', cerrada_en = now(), reabierta = false where id = p_semana;
  perform public.asegurar_semana(s.empresa_id, s.fin + 1);
  perform public._evento(s.empresa_id, 'semana_cerrada', jsonb_build_object('semana', p_semana));
end $$;

-- pg_cron, cada 5 minutos: cierra las semanas cuyo miércoles 11:59 p.m. local ya pasó.
create or replace function public.cerrar_semanas_vencidas(p_ahora timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in
    select s.id from semanas s join empresas e on e.id = s.empresa_id
    where s.estado = 'abierta' and not s.reabierta
      and ((s.fin + 1)::timestamp at time zone e.zona_horaria) <= p_ahora
    order by s.inicio
  loop
    perform public._cerrar_semana(r.id);
    n := n + 1;
  end loop;
  -- Que siempre exista la semana en curso de cada empresa.
  perform public.asegurar_semana(e.id, (p_ahora at time zone e.zona_horaria)::date) from empresas e;
  return n;
end $$;

-- pg_cron, cada 5 minutos: cierra a la hora configurada (11:00 p.m.) los turnos que se quedaron abiertos.
create or replace function public.cerrar_turnos_olvidados(p_ahora timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with c as (
    select t.id,
           (((t.entrada at time zone e.zona_horaria)::date + e.hora_cierre_turno)
             + case when ((t.entrada at time zone e.zona_horaria)::date + e.hora_cierre_turno)
                         <= (t.entrada at time zone e.zona_horaria)
                    then interval '1 day' else interval '0' end
           ) at time zone e.zona_horaria as corte
    from turnos t join empresas e on e.id = t.empresa_id
    where t.salida is null
  )
  update turnos t
     set salida = c.corte, cierre_automatico = true, estado = 'por_aprobar'
    from c
   where t.id = c.id and c.corte <= p_ahora;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.cerrar_semana(p_semana uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir_rol('admin');
  if not exists (select 1 from semanas where id = p_semana and empresa_id = public.mi_empresa() and estado = 'abierta') then
    raise exception 'La semana no está abierta';
  end if;
  perform public._cerrar_semana(p_semana);
end $$;

create or replace function public.reabrir_semana(p_semana uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare s semanas;
begin
  perform public._exigir_rol('admin');
  select * into s from semanas where id = p_semana and empresa_id = public.mi_empresa() for update;
  if not found then raise exception 'Semana no encontrada'; end if;
  if s.estado = 'pagada' then raise exception 'Una semana pagada no se puede reabrir'; end if;
  if s.estado = 'abierta' then raise exception 'La semana ya está abierta'; end if;
  if coalesce(length(trim(p_motivo)), 0) = 0 then raise exception 'Escribe el motivo para reabrir'; end if;

  delete from nomina_semanal where semana_id = p_semana;
  delete from nomina_proyecto where semana_id = p_semana;
  update turnos set semana_id = null where semana_id = p_semana;
  update semanas set estado = 'abierta', reabierta = true, cerrada_en = null where id = p_semana;
  perform public._evento(s.empresa_id, 'semana_reabierta', jsonb_build_object('semana', p_semana, 'motivo', p_motivo));
end $$;

create or replace function public.marcar_semana_pagada(p_semana uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s semanas;
begin
  perform public._exigir_rol('admin');
  select * into s from semanas where id = p_semana and empresa_id = public.mi_empresa() for update;
  if not found or s.estado <> 'cerrada' then raise exception 'Solo se marca pagada una semana cerrada'; end if;
  update semanas set estado = 'pagada', pagada_en = now() where id = p_semana;
  perform public._evento(s.empresa_id, 'semana_pagada', jsonb_build_object('semana', p_semana));
end $$;

-- ---------------------------------------------------------------------------
-- Lecturas de nómina para la app
-- Semana abierta: cálculo en vivo. Cerrada o pagada: lo congelado.
-- Admin y dueño ven a todos; los demás solo lo propio.
-- ---------------------------------------------------------------------------
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
             public.tarifa_vigente(c.perfil_id, s.fin), c.bruto, c.seguro_pct, c.seguro, c.prestamo, c.neto,
             c.con_aprobacion_admin, s.estado
      from public._calcular_semana(p_semana) c join perfiles p on p.id = c.perfil_id
      where v_todos or c.perfil_id = auth.uid()
      order by p.nombre;
  else
    return query
      select n.perfil_id, p.nombre, p.oficio, n.minutos_reg, n.minutos_extra,
             public.tarifa_vigente(n.perfil_id, s.fin), n.bruto, n.seguro_pct, n.seguro, n.prestamo, n.neto,
             n.con_aprobacion_admin, s.estado
      from nomina_semanal n join perfiles p on p.id = n.perfil_id
      where n.semana_id = p_semana and (v_todos or n.perfil_id = auth.uid())
      order by p.nombre;
  end if;
end $$;

create or replace function public.nomina_semana_proyectos(p_semana uuid)
returns table (perfil_id uuid, proyecto_id uuid, proyecto text, minutos_reg integer, minutos_extra integer, bruto numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  s semanas;
  v_todos boolean := public.tengo_rol('admin') or public.tengo_rol('dueno');
begin
  select * into s from semanas where id = p_semana and empresa_id = public.mi_empresa();
  if not found then raise exception 'Semana no encontrada'; end if;

  if s.estado = 'abierta' then
    return query
      select d.perfil_id, d.proyecto_id, pr.nombre, d.minutos_reg, d.minutos_extra, round(d.bruto_exacto, 2)
      from public._detalle_semana(p_semana) d join proyectos pr on pr.id = d.proyecto_id
      where v_todos or d.perfil_id = auth.uid()
      order by pr.nombre;
  else
    return query
      select n.perfil_id, n.proyecto_id, pr.nombre, n.minutos_reg, n.minutos_extra, n.bruto
      from nomina_proyecto n join proyectos pr on pr.id = n.proyecto_id
      where n.semana_id = p_semana and (v_todos or n.perfil_id = auth.uid())
      order by pr.nombre;
  end if;
end $$;

-- Reporte mensual (admin y dueño): semanas cerradas o pagadas cuyo viernes de pago cae en el mes.
create or replace function public.reporte_mensual(p_anio integer, p_mes integer)
returns table (
  perfil_id uuid, nombre text, semanas integer, minutos_reg integer, minutos_extra integer,
  bruto numeric, seguro numeric, prestamo numeric, neto numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.tengo_rol('admin') or public.tengo_rol('dueno')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  return query
    select n.perfil_id, p.nombre, count(*)::integer,
           sum(n.minutos_reg)::integer, sum(n.minutos_extra)::integer,
           sum(n.bruto), sum(n.seguro), sum(n.prestamo), sum(n.neto)
    from nomina_semanal n
    join semanas s on s.id = n.semana_id
    join perfiles p on p.id = n.perfil_id
    where s.empresa_id = public.mi_empresa()
      and s.estado in ('cerrada', 'pagada')
      and extract(year from s.fin + 2) = p_anio and extract(month from s.fin + 2) = p_mes
    group by n.perfil_id, p.nombre
    order by p.nombre;
end $$;

create or replace function public.reporte_mensual_proyectos(p_anio integer, p_mes integer)
returns table (proyecto_id uuid, proyecto text, minutos_reg integer, minutos_extra integer, bruto numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.tengo_rol('admin') or public.tengo_rol('dueno')) then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  return query
    select n.proyecto_id, pr.nombre, sum(n.minutos_reg)::integer, sum(n.minutos_extra)::integer, sum(n.bruto)
    from nomina_proyecto n
    join semanas s on s.id = n.semana_id
    join proyectos pr on pr.id = n.proyecto_id
    where s.empresa_id = public.mi_empresa()
      and s.estado in ('cerrada', 'pagada')
      and extract(year from s.fin + 2) = p_anio and extract(month from s.fin + 2) = p_mes
    group by n.proyecto_id, pr.nombre
    order by pr.nombre;
end $$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

-- Solo el sistema (pg_cron / service role)
revoke execute on function public._cerrar_semana(uuid) from authenticated;
revoke execute on function public.cerrar_semanas_vencidas(timestamptz) from authenticated;
revoke execute on function public.cerrar_turnos_olvidados(timestamptz) from authenticated;
revoke execute on function public._exigir_rol(text) from authenticated;
revoke execute on function public._evento(uuid, text, jsonb) from authenticated;
revoke execute on function public._revisar_gps(uuid, uuid, double precision, double precision) from authenticated;
revoke execute on function public._turnos_semana(uuid) from authenticated;
revoke execute on function public._detalle_semana(uuid) from authenticated;
revoke execute on function public._calcular_semana(uuid) from authenticated;
revoke execute on function public.asegurar_semana(uuid, date) from authenticated;
-- Leen datos de cualquier trabajador sin filtro: solo para uso interno.
revoke execute on function public.tarifa_vigente(uuid, date) from authenticated;
revoke execute on function public.seguro_vigente(uuid, date) from authenticated;
revoke execute on function public.prestamo_saldo(uuid) from authenticated;

-- Lo que la app puede llamar (cada función revisa el rol por dentro)
grant execute on function
  public.mi_empresa(), public.tengo_rol(text), public.supervisa_proyecto(uuid), public.supervisa_a(uuid),
  public.semana_inicio_de(date), public.minutos_turno(timestamptz, timestamptz, text, time, time, time),
  public._cruce_min(timestamp, timestamp, timestamp, timestamp),
  public.distancia_m(double precision, double precision, double precision, double precision),
  public.semana_actual(), public.marcar_entrada(uuid, double precision, double precision),
  public.marcar_salida(double precision, double precision), public.aprobar_turnos(uuid[]),
  public.corregir_turno(uuid, timestamptz, timestamptz, text), public.cambiar_tarifa(uuid, numeric, date),
  public.cambiar_seguro(uuid, numeric, date), public.crear_prestamo(uuid, numeric, date, text),
  public.fijar_descuento_prestamo(uuid, uuid, numeric), public.cerrar_semana(uuid),
  public.reabrir_semana(uuid, text), public.marcar_semana_pagada(uuid),
  public.nomina_semana(uuid), public.nomina_semana_proyectos(uuid),
  public.reporte_mensual(integer, integer), public.reporte_mensual_proyectos(integer, integer)
to authenticated;
