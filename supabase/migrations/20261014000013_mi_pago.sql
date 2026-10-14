-- Pago del trabajador por compañía (pantalla Mi pago).
-- Mi pago del trabajador: una fila por compañía para una semana (inicio), sin cambiar de compañía activa.
create or replace function public.mi_pago(p_inicio date)
returns table (
  empresa_id uuid, empresa text, semana_id uuid, estado_semana text,
  minutos_reg integer, minutos_extra integer, tarifa numeric, bruto numeric,
  seguro numeric, prestamo numeric, neto numeric, proyectos jsonb
) language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
  with sem as (
    select s.* from semanas s
    where s.inicio = p_inicio
      and (public.es_miembro(auth.uid(), s.empresa_id)
           or exists (select 1 from nomina_semanal n where n.semana_id = s.id and n.perfil_id = auth.uid() and not n.anulada))
  ),
  filas as (
    select s.id as sid, s.empresa_id as emp, s.estado as est, s.fin as fin, c.minutos_reg as mr, c.minutos_extra as me,
           c.bruto as br, c.seguro as sg, c.prestamo as pr, c.neto as ne
    from sem s cross join lateral public._calcular_semana(s.id) c
    where s.estado = 'abierta' and c.perfil_id = auth.uid()
    union all
    select s.id, s.empresa_id, s.estado, s.fin, n.minutos_reg, n.minutos_extra, n.bruto, n.seguro, n.prestamo, n.neto
    from sem s join nomina_semanal n on n.semana_id = s.id
    where s.estado <> 'abierta' and n.perfil_id = auth.uid() and not n.anulada
  )
  select f.emp, e.nombre::text, f.sid, f.est::text, f.mr, f.me, public.tarifa_vigente(auth.uid(), f.fin, f.emp),
         f.br, f.sg, f.pr, f.ne,
         coalesce((
           select jsonb_agg(jsonb_build_object('proyecto', x.nombre, 'minutos', x.mr + x.me, 'bruto', x.bruto) order by x.nombre)
           from (
             select pr.nombre, d.minutos_reg as mr, d.minutos_extra as me, round(d.bruto_exacto, 2) as bruto
               from public._detalle_semana(f.sid) d join proyectos pr on pr.id = d.proyecto_id
              where f.est = 'abierta' and d.perfil_id = auth.uid()
             union all
             select pr.nombre, np.minutos_reg, np.minutos_extra, np.bruto
               from nomina_proyecto np join proyectos pr on pr.id = np.proyecto_id
              where f.est <> 'abierta' and np.semana_id = f.sid and np.perfil_id = auth.uid() and not np.anulada
           ) x
         ), '[]'::jsonb)
  from filas f join empresas e on e.id = f.emp
  order by e.nombre;
end $$;
revoke all on function public.mi_pago(date) from public, anon;
grant execute on function public.mi_pago(date) to authenticated;
