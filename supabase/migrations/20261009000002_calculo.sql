-- ObraPay · Funciones auxiliares y cálculo de nómina
-- Reglas (ver plan técnico):
--   1. Regular = minutos antes de hora_extra_desde (5 p.m.) en hora local; extra = el resto. Misma tarifa.
--   2. Almuerzo fijo de 12:00 a 1:00 p.m.: los minutos marcados dentro de ese horario no se pagan.
--   3. Tarifa = la vigente en la fecha local de entrada del turno.
--   4. Bruto se redondea a centavos al final de la semana, no por turno.
--   5. Seguro = % vigente al último día de la semana × bruto, redondeado a centavos.
--   6. Solo cuentan turnos aprobados (por supervisor o por admin).

-- ---------------------------------------------------------------------------
-- Quién está llamando
-- ---------------------------------------------------------------------------
create or replace function public.mi_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from perfiles where id = auth.uid() and activo
$$;

create or replace function public.tengo_rol(p_rol text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p_rol = any (roles) from perfiles where id = auth.uid() and activo), false)
$$;

create or replace function public.supervisa_proyecto(p_proyecto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from proyecto_supervisores
    where proyecto_id = p_proyecto and perfil_id = auth.uid()
  ) and public.tengo_rol('supervisor')
$$;

create or replace function public.supervisa_a(p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from proyecto_supervisores s
    join proyecto_trabajadores t on t.proyecto_id = s.proyecto_id
    where s.perfil_id = auth.uid() and t.perfil_id = p_perfil
  ) and public.tengo_rol('supervisor')
$$;

-- ---------------------------------------------------------------------------
-- Fechas
-- ---------------------------------------------------------------------------
-- Jueves en que empieza la semana de pago que contiene p_fecha.
create or replace function public.semana_inicio_de(p_fecha date) returns date
language sql immutable set search_path = public as $$
  select p_fecha - ((extract(isodow from p_fecha)::int - 4 + 7) % 7)
$$;

-- Semana (abierta o no) de una fecha; la crea si no existe.
create or replace function public.asegurar_semana(p_empresa uuid, p_fecha date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inicio date := public.semana_inicio_de(p_fecha);
  v_id uuid;
begin
  select id into v_id from semanas where empresa_id = p_empresa and inicio = v_inicio;
  if v_id is null then
    insert into semanas (empresa_id, inicio, fin)
    values (p_empresa, v_inicio, v_inicio + 6)
    on conflict (empresa_id, inicio) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from semanas where empresa_id = p_empresa and inicio = v_inicio;
    end if;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reglas 1 y 2: partir un turno en minutos regulares y extra, sin el almuerzo
-- ---------------------------------------------------------------------------
-- Minutos en que [e, s) se cruza con [a, b).
create or replace function public._cruce_min(e timestamp, s timestamp, a timestamp, b timestamp) returns numeric
language sql immutable set search_path = public as $$
  select greatest(0, extract(epoch from (least(s, b) - greatest(e, a))) / 60)
$$;

create or replace function public.minutos_turno(
  p_entrada timestamptz, p_salida timestamptz, p_tz text, p_hora_extra time,
  p_alm_ini time default null, p_alm_fin time default null
) returns table (min_reg integer, min_extra integer)
language sql stable set search_path = public as $$
  with t as (
    select date_trunc('minute', p_entrada at time zone p_tz) as e,
           date_trunc('minute', p_salida  at time zone p_tz) as s
  ),
  r as (
    select
      (extract(epoch from (t.s - t.e)) / 60)::integer as total,
      coalesce(sum(public._cruce_min(t.e, t.s, g.d, g.d + p_hora_extra)), 0)::integer as reg_bruto,
      -- almuerzo que cae en horario regular y en horario extra
      coalesce(sum(case when p_alm_ini is null then 0 else
        public._cruce_min(t.e, t.s, g.d + p_alm_ini, g.d + least(p_alm_fin, p_hora_extra)) end), 0)::integer as alm_reg,
      coalesce(sum(case when p_alm_ini is null then 0 else
        public._cruce_min(t.e, t.s, g.d + greatest(p_alm_ini, p_hora_extra), g.d + p_alm_fin) end), 0)::integer as alm_extra
    from t
    cross join lateral generate_series(date_trunc('day', t.e), date_trunc('day', t.s), interval '1 day') as g(d)
    group by t.s, t.e
  )
  select r.reg_bruto - r.alm_reg, (r.total - r.reg_bruto) - r.alm_extra from r
$$;

-- ---------------------------------------------------------------------------
-- Tarifa y seguro vigentes
-- ---------------------------------------------------------------------------
create or replace function public.tarifa_vigente(p_perfil uuid, p_fecha date) returns numeric
language sql stable security definer set search_path = public as $$
  select monto_hora from tarifas
  where perfil_id = p_perfil and vigente_desde <= p_fecha
  order by vigente_desde desc limit 1
$$;

create or replace function public.seguro_vigente(p_perfil uuid, p_fecha date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((
    select porcentaje from seguros
    where perfil_id = p_perfil and vigente_desde <= p_fecha
    order by vigente_desde desc limit 1
  ), 0)
$$;

create or replace function public.prestamo_saldo(p_prestamo uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select p.monto_total - coalesce((select sum(d.monto) from descuentos_prestamo d where d.prestamo_id = p.id), 0)
  from prestamos p where p.id = p_prestamo
$$;

-- ---------------------------------------------------------------------------
-- Turnos que entran a una semana, ya partidos y con almuerzo descontado
--   Semana abierta : turnos aprobados sin semana asignada con fecha <= fin
--                    (lo aprobado tarde de semanas anteriores pasa a esta);
--                    si hay dos semanas abiertas, cada turno va solo a la más antigua.
--   Semana cerrada : turnos que quedaron asignados a ella al cerrar.
-- Uso interno: no se expone a los usuarios.
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
    select t.id, t.perfil_id, t.proyecto_id,
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
         public.tarifa_vigente(b.perfil_id, b.fecha), b.aprobado_admin
  from base b
$$;

-- Detalle por trabajador y proyecto (bruto sin redondear todavía).
create or replace function public._detalle_semana(p_semana uuid)
returns table (
  perfil_id uuid, proyecto_id uuid, minutos_reg integer, minutos_extra integer,
  bruto_exacto numeric, sin_tarifa boolean
)
language sql stable security definer set search_path = public as $$
  select t.perfil_id, t.proyecto_id,
         sum(t.min_reg)::integer, sum(t.min_extra)::integer,
         sum((t.min_reg + t.min_extra) * coalesce(t.tarifa, 0) / 60.0),
         bool_or(t.tarifa is null)
  from public._turnos_semana(p_semana) t
  group by t.perfil_id, t.proyecto_id
$$;

-- Nómina por trabajador.
create or replace function public._calcular_semana(p_semana uuid)
returns table (
  perfil_id uuid, minutos_reg integer, minutos_extra integer, bruto numeric,
  seguro_pct numeric, seguro numeric, prestamo numeric, neto numeric,
  con_aprobacion_admin boolean, sin_tarifa boolean
)
language sql stable security definer set search_path = public as $$
  with sem as (select * from semanas where id = p_semana),
  horas as (
    select t.perfil_id,
           sum(t.min_reg)::integer as reg, sum(t.min_extra)::integer as extra,
           round(sum((t.min_reg + t.min_extra) * coalesce(t.tarifa, 0) / 60.0), 2) as bruto,
           bool_or(t.aprobado_admin) as con_admin,
           bool_or(t.tarifa is null) as sin_tarifa
    from public._turnos_semana(p_semana) t
    group by t.perfil_id
  ),
  pres as (
    select p.perfil_id, sum(d.monto) as monto
    from descuentos_prestamo d join prestamos p on p.id = d.prestamo_id
    where d.semana_id = p_semana
    group by p.perfil_id
  ),
  calc as (
    select h.*, public.seguro_vigente(h.perfil_id, sem.fin) as pct, coalesce(pr.monto, 0) as prest
    from horas h cross join sem left join pres pr on pr.perfil_id = h.perfil_id
  )
  select c.perfil_id, c.reg, c.extra, c.bruto, c.pct,
         round(c.bruto * c.pct / 100, 2),
         c.prest,
         c.bruto - round(c.bruto * c.pct / 100, 2) - c.prest,
         c.con_admin, c.sin_tarifa
  from calc c
$$;

-- Las funciones internas no se pueden llamar desde la app.
revoke execute on function public._turnos_semana(uuid)   from public;
revoke execute on function public._detalle_semana(uuid)  from public;
revoke execute on function public._calcular_semana(uuid) from public;
revoke execute on function public.asegurar_semana(uuid, date) from public;
