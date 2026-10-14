-- ObraPay · Equipo por compañía (solo lectura para admin y dueño): cuántos trabajadores y supervisores hay en cada
-- compañía según los proyectos, y cuántos trabajadores tiene a cargo cada supervisor. Solo proyectos activos y
-- personas activas con membresía vigente. Nunca mezcla compañías: cada fila lleva su empresa_id.
--   tipo 'total'      : trabajadores y supervisores distintos con proyecto + proyectos activos (nombre = null)
--   tipo 'sin_asignar': trabajadores activos de la compañía sin ningún proyecto activo
--   tipo 'proyecto'   : trabajadores y supervisores de ese proyecto
--   tipo 'supervisor' : proyectos que supervisa y trabajadores distintos a su cargo
create or replace function public.equipo_empresas()
returns table (empresa_id uuid, tipo text, proyecto_id uuid, perfil_id uuid, nombre text,
               trabajadores integer, supervisores integer, proyectos integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_gerencia() then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
  return query
    with mis as (select m.empresa_id as emp from perfil_empresas m where m.perfil_id = auth.uid() and m.baja_en is null),
    pr as (select p.id, p.empresa_id, p.nombre from proyectos p where p.empresa_id in (select emp from mis) and p.activo),
    pt as (select t.proyecto_id, t.empresa_id, t.perfil_id from proyecto_trabajadores t
           join pr on pr.id = t.proyecto_id
           join perfiles pe on pe.id = t.perfil_id and pe.activo
           where public.es_miembro(t.perfil_id, t.empresa_id)),
    ps as (select s.proyecto_id, s.empresa_id, s.perfil_id from proyecto_supervisores s
           join pr on pr.id = s.proyecto_id
           join perfiles pe on pe.id = s.perfil_id and pe.activo
           where public.es_miembro(s.perfil_id, s.empresa_id))
    select e.emp, 'total'::text, null::uuid, null::uuid, null::text,
           (select count(distinct pt.perfil_id)::int from pt where pt.empresa_id = e.emp),
           (select count(distinct ps.perfil_id)::int from ps where ps.empresa_id = e.emp),
           (select count(*)::int from pr where pr.empresa_id = e.emp)
      from mis e
    union all
    select e.emp, 'sin_asignar'::text, null::uuid, null::uuid, null::text,
           (select count(*)::int from perfil_empresas m join perfiles pe on pe.id = m.perfil_id and pe.activo
             where m.empresa_id = e.emp and m.baja_en is null and 'trabajador' = any (pe.roles)
               and not exists (select 1 from pt where pt.empresa_id = e.emp and pt.perfil_id = m.perfil_id)),
           null::int, null::int
      from mis e
    union all
    select pr.empresa_id, 'proyecto'::text, pr.id, null::uuid, pr.nombre::text,
           (select count(distinct pt.perfil_id)::int from pt where pt.proyecto_id = pr.id),
           (select count(distinct ps.perfil_id)::int from ps where ps.proyecto_id = pr.id),
           null::int
      from pr
    union all
    select s.empresa_id, 'supervisor'::text, null::uuid, s.perfil_id, pe.nombre::text,
           (select count(distinct pt.perfil_id)::int from pt
             where pt.empresa_id = s.empresa_id and pt.proyecto_id in
                   (select ps2.proyecto_id from ps ps2 where ps2.perfil_id = s.perfil_id and ps2.empresa_id = s.empresa_id)),
           null::int,
           count(distinct s.proyecto_id)::int
      from ps s join perfiles pe on pe.id = s.perfil_id
     group by s.empresa_id, s.perfil_id, pe.nombre;
end $$;
revoke all on function public.equipo_empresas() from public, anon;
grant execute on function public.equipo_empresas() to authenticated;
