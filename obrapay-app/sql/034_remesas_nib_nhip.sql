-- 034 — Remesas NIB/NHIP, brecha de registro NHIP y salario mínimo
-- Origen: Radar de oportunidades TCI (OPP-1). Ver docs/radar-seguros-nib-nhip.md
-- Tasas y topes ya son configurables (031). Confirmar con NIB/contador.

alter table perfil_nomina
  add column if not exists numero_nib text,
  add column if not exists numero_nhip text,
  add column if not exists permiso_aprobado_el date,
  add column if not exists tarjeta_recibida_el date;

alter table configuracion_empresa
  add column if not exists salario_minimo_hora numeric(6,2) not null default 9.00,
  add column if not exists nhip_dia_vencimiento int not null default 14,
  add column if not exists nib_dia_vencimiento int not null default 15;

-- Remesa mensual por agencia. Se reparte por FECHA DE PAGO (decisión por confirmar).
create or replace function remesa_mensual(p_empresa_id uuid, p_anio int, p_mes int)
returns table (agencia text, aporte_empleado numeric, aporte_empleador numeric, total numeric, vence date)
language sql stable security invoker set search_path = public
as $$
  with base as (
    select coalesce(sum(p.descuento_nib),0) nib_e, coalesce(sum(p.aporte_patronal_nib),0) nib_p,
           coalesce(sum(p.descuento_nhip),0) nhip_e, coalesce(sum(p.aporte_patronal_nhip),0) nhip_p
    from pagos_semanales p
    join semanas_pago s on s.id = p.semana_id
    where s.empresa_id = p_empresa_id
      and extract(year from s.fecha_pago) = p_anio
      and extract(month from s.fecha_pago) = p_mes
  ), cfg as (
    select coalesce((select nhip_dia_vencimiento from configuracion_empresa where empresa_id = p_empresa_id),14) d_nhip,
           coalesce((select nib_dia_vencimiento from configuracion_empresa where empresa_id = p_empresa_id),15) d_nib
  ), mes_sig as (
    select (make_date(p_anio, p_mes, 1) + interval '1 month')::date as d
  )
  select 'NHIP', round(nhip_e,2), round(nhip_p,2), round(nhip_e+nhip_p,2),
         (select d from mes_sig) + (select d_nhip from cfg) - 1
  from base
  union all
  select 'NIB', round(nib_e,2), round(nib_p,2), round(nib_e+nib_p,2),
         (select d from mes_sig) + (select d_nib from cfg) - 1
  from base;
$$;

-- Trabajadores con permiso aprobado y sin número NHIP, con lo cotizado desde el permiso
create or replace view v_brecha_registro_nhip with (security_invoker = true) as
select u.empresa_id, u.id as usuario_id, u.nombre,
       pn.permiso_aprobado_el, pn.tarjeta_recibida_el,
       coalesce(sum(p.descuento_nhip + p.aporte_patronal_nhip),0) as nhip_acumulado
from perfil_nomina pn
join usuarios u on u.id = pn.usuario_id
left join pagos_semanales p on p.usuario_id = pn.usuario_id
left join semanas_pago s on s.id = p.semana_id and s.fecha_pago >= pn.permiso_aprobado_el
where pn.permiso_aprobado_el is not null
  and (pn.numero_nhip is null or pn.numero_nhip = '')
group by u.empresa_id, u.id, u.nombre, pn.permiso_aprobado_el, pn.tarjeta_recibida_el;
