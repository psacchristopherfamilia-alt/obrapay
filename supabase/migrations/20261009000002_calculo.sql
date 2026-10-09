-- ObraPay · Funciones auxiliares y cálculo de nómina
-- Reglas (ver plan técnico):
--   1. Regular = minutos antes de hora_extra_desde (5 p.m.) en hora local; extra = el resto. Misma tarifa.
--   2. Almuerzo fijo: una vez por día, si el día suma >= almuerzo_desde_min; sale de las horas regulares
--      empezando por el primer turno del día (si no alcanza, del extra).
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
language sql immutable as $$
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
-- Regla 1: partir un turno en minutos regulares y extra
-- ---------------------------------------------------------------------------
create or replace function public.minutos_turno(
  p_entrada timestamptz, p_salida timestamptz, p_tz text, p_hora_extra time
) returns table (min_reg integer, min_extra integer)
language sql stable as $$
  with t as (
    select date_trunc('minute', p_entrada at time zone p_tz) as e,
           date_trunc('minute', p_salida  at time zone p_tz) as s
  ),
  r as (
    select coalesce(sum(greatest(0,
             extract(epoch from (least(t.s, g.d + p_hora_extra) - greatest(t.e, g.d))) / 60
           )), 0)::integer as reg,
           (extract(epoch from (t.s - t.e)) / 60)::integer as total
    from t
    cross join lateral generate_series(date_trunc('day', t.e), date_trunc('day', t.s), interval '1 day') as g(d)
    group by t.s, t.e
  )
  select r.reg, r.total - r.reg from r
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
           e.almuerzo_min as alm, e.almuerzo_desde_min as alm_desde
    from semanas s join empresas e on e.id = s.empresa_id
    where s.id = p_semana
  ),
  base as (
    select t.id, t.perfil_id, t.proyecto_id, t.entrada,
           (t.entrada at time zone sem.tz)::date as fecha,
           m.min_reg, m.min_extra,
           t.estado = 'aprobado_admin' as aprobado_admin,
           sem.alm, sem.alm_desde
    from sem
    join turnos t on t.empresa_id = sem.empresa_id
    cross join lateral public.minutos_turno(t.entrada, t.salida, sem.tz, sem.hx) m
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
  ),
  dia as (
    select b.*,
           sum(b.min_reg)   over w_dia as reg_dia,
           sum(b.min_extra) over w_dia as extra_dia,
           coalesce(sum(b.min_reg)   over w_antes, 0) as reg_antes,
           coalesce(sum(b.min_extra) over w_antes, 0) as extra_antes
    from base b
    window w_dia   as (partition by b.perfil_id, b.fecha),
           w_antes as (partition by b.perfil_id, b.fecha order by b.entrada, b.id
                       rows between unbounded preceding and 1 preceding)
  ),
  alm as (
    select d.*,
           case when d.reg_dia + d.extra_dia >= d.alm_desde then d.alm else 0 end as alm_dia
    from dia d
  )
  select a.id, a.perfil_id, a.proyecto_id, a.fecha,
         (a.min_reg - least(a.min_reg, greatest(0, a.alm_dia - a.reg_antes)))::integer,
         (a.min_extra - least(a.min_extra,
             greatest(0, greatest(0, a.alm_dia - a.reg_dia) - a.extra_antes)))::integer,
         public.tarifa_vigente(a.perfil_id, a.fecha),
         a.aprobado_admin
  from alm a
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
