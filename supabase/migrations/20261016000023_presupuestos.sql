-- Presupuesto vs real por obra.
-- El admin escribe el presupuesto (4 categorías) y el avance. Lo real sale solo:
--   mano de obra   = bruto de la nómina de semanas cerradas o pagadas
--   materiales     = gastos 'materiales'
--   herramientas   = gastos 'herramientas'
--   subcontratos y otros = gastos 'poliza', 'transporte', 'subcontrato' y 'otros'
-- Avisos al admin cuando el total llega al 50, 75, 90 y 100 %, y cuando una categoría se pasa.

create table public.presupuestos (
  proyecto_id      uuid primary key references public.proyectos (id),
  empresa_id       uuid not null references public.empresas (id),
  mano_obra        numeric(12, 2) not null default 0 check (mano_obra >= 0),
  materiales       numeric(12, 2) not null default 0 check (materiales >= 0),
  herramientas     numeric(12, 2) not null default 0 check (herramientas >= 0),
  subcontratos     numeric(12, 2) not null default 0 check (subcontratos >= 0),
  avance           integer not null default 0 check (avance between 0 and 100),
  actualizado_por  uuid references public.perfiles (id),
  actualizado_en   timestamptz not null default now()
);

-- Marcas internas: qué avisos ya se dieron, para no repetirlos cada día.
create table public.presupuesto_avisos (
  proyecto_id  uuid not null references public.proyectos (id) on delete cascade,
  clave        text not null,
  creado_en    timestamptz not null default now(),
  primary key (proyecto_id, clave)
);

alter table public.presupuestos enable row level security;
alter table public.presupuesto_avisos enable row level security;
revoke all on public.presupuestos, public.presupuesto_avisos from anon, authenticated;
grant select on public.presupuestos to authenticated;
create policy presupuestos_ver on public.presupuestos for select to authenticated
  using (empresa_id = public.mi_empresa() and public.es_gerencia());

-- Lo real de una obra, por categoría.
create or replace function public._presupuesto_real(p_proyecto uuid)
returns table (mano_obra numeric, materiales numeric, herramientas numeric, subcontratos numeric)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select sum(n.bruto) from nomina_proyecto n join semanas s on s.id = n.semana_id
               where n.proyecto_id = p_proyecto and not n.anulada and s.estado in ('cerrada', 'pagada')), 0),
    coalesce((select sum(g.monto) from gastos g where g.proyecto_id = p_proyecto and not g.anulado and g.categoria = 'materiales'), 0),
    coalesce((select sum(g.monto) from gastos g where g.proyecto_id = p_proyecto and not g.anulado and g.categoria = 'herramientas'), 0),
    coalesce((select sum(g.monto) from gastos g where g.proyecto_id = p_proyecto and not g.anulado
               and g.categoria in ('poliza', 'transporte', 'subcontrato', 'otros')), 0)
$$;
revoke all on function public._presupuesto_real(uuid) from public, anon, authenticated;

-- Revisa una obra y avisa a los admin. Un aviso por nivel (50, 75, 90, 100): solo el más alto que se acaba de cruzar.
-- Si el presupuesto sube y el uso baja de un nivel, ese nivel puede volver a avisar.
create or replace function public._avisar_presupuesto(p_proyecto uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b presupuestos; r record; pr proyectos;
  v_pres numeric; v_real numeric; v_pct numeric; v_nivel integer; v_nuevo integer := null;
  cat record;
begin
  select * into b from presupuestos where proyecto_id = p_proyecto;
  select * into pr from proyectos where id = p_proyecto;
  if not found then return; end if;
  v_pres := coalesce(b.mano_obra + b.materiales + b.herramientas + b.subcontratos, 0);
  if b.proyecto_id is null or v_pres <= 0 or not pr.activo then
    delete from presupuesto_avisos where proyecto_id = p_proyecto;
    return;
  end if;
  select * into r from public._presupuesto_real(p_proyecto);
  v_real := r.mano_obra + r.materiales + r.herramientas + r.subcontratos;
  v_pct := v_real / v_pres * 100;

  -- niveles del total
  foreach v_nivel in array array[50, 75, 90, 100] loop
    if v_pct >= v_nivel then
      if not exists (select 1 from presupuesto_avisos where proyecto_id = p_proyecto and clave = 'total:' || v_nivel) then
        insert into presupuesto_avisos (proyecto_id, clave) values (p_proyecto, 'total:' || v_nivel);
        v_nuevo := v_nivel;
      end if;
    else
      delete from presupuesto_avisos where proyecto_id = p_proyecto and clave = 'total:' || v_nivel;
    end if;
  end loop;
  if v_nuevo is not null then
    insert into notificaciones (empresa_id, perfil_id, tipo, datos)
    select pr.empresa_id, p.id, 'presupuesto_umbral',
           jsonb_build_object('proyecto', pr.id, 'obra', pr.nombre, 'nivel', v_nuevo, 'usado', round(v_pct),
                              'gastado', round(v_real), 'presupuesto', round(v_pres), 'avance', b.avance)
      from perfiles p
     where p.activo and 'admin' = any (p.roles) and public.es_miembro(p.id, pr.empresa_id);
  end if;

  -- categorías que se pasaron
  for cat in
    select * from (values
      ('mano_obra', b.mano_obra, r.mano_obra), ('materiales', b.materiales, r.materiales),
      ('herramientas', b.herramientas, r.herramientas), ('subcontratos', b.subcontratos, r.subcontratos)
    ) as x (k, pres, gastado)
  loop
    if cat.pres > 0 and cat.gastado > cat.pres then
      if not exists (select 1 from presupuesto_avisos where proyecto_id = p_proyecto and clave = 'cat:' || cat.k) then
        insert into presupuesto_avisos (proyecto_id, clave) values (p_proyecto, 'cat:' || cat.k);
        insert into notificaciones (empresa_id, perfil_id, tipo, datos)
        select pr.empresa_id, p.id, 'presupuesto_categoria',
               jsonb_build_object('proyecto', pr.id, 'obra', pr.nombre, 'categoria', cat.k, 'exceso', round(cat.gastado - cat.pres))
          from perfiles p
         where p.activo and 'admin' = any (p.roles) and public.es_miembro(p.id, pr.empresa_id);
      end if;
    else
      delete from presupuesto_avisos where proyecto_id = p_proyecto and clave = 'cat:' || cat.k;
    end if;
  end loop;
end $$;
revoke all on function public._avisar_presupuesto(uuid) from public, anon, authenticated;

-- Corre cada día (cron). Devuelve cuántas obras con presupuesto revisó.
create or replace function public.avisar_presupuestos() returns integer
language plpgsql security definer set search_path = public as $$
declare x record; n integer := 0;
begin
  for x in select proyecto_id from presupuestos loop
    perform public._avisar_presupuesto(x.proyecto_id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.avisar_presupuestos() from public, anon, authenticated;

-- Guardar o quitar el presupuesto de una obra (solo admin). Todo en cero lo quita.
create or replace function public.guardar_presupuesto(
  p_proyecto uuid, p_mano_obra numeric, p_materiales numeric, p_herramientas numeric, p_subcontratos numeric, p_avance integer
) returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_mo numeric; v_ma numeric; v_he numeric; v_su numeric;
begin
  if not public.tengo_rol('admin') then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  if not exists (select 1 from proyectos where id = p_proyecto and empresa_id = v_emp) then raise exception 'Proyecto no encontrado'; end if;
  v_mo := round(coalesce(p_mano_obra, 0), 2); v_ma := round(coalesce(p_materiales, 0), 2);
  v_he := round(coalesce(p_herramientas, 0), 2); v_su := round(coalesce(p_subcontratos, 0), 2);
  if least(v_mo, v_ma, v_he, v_su) < 0 then raise exception 'Los montos no pueden ser negativos'; end if;
  if greatest(v_mo, v_ma, v_he, v_su) > 100000000 then raise exception 'Monto demasiado grande'; end if;
  if p_avance is null or p_avance < 0 or p_avance > 100 then raise exception 'El avance va de 0 a 100'; end if;
  if v_mo + v_ma + v_he + v_su = 0 then
    delete from presupuestos where proyecto_id = p_proyecto;
  else
    insert into presupuestos (proyecto_id, empresa_id, mano_obra, materiales, herramientas, subcontratos, avance, actualizado_por, actualizado_en)
    values (p_proyecto, v_emp, v_mo, v_ma, v_he, v_su, p_avance, auth.uid(), now())
    on conflict (proyecto_id) do update
      set mano_obra = excluded.mano_obra, materiales = excluded.materiales, herramientas = excluded.herramientas,
          subcontratos = excluded.subcontratos, avance = excluded.avance, actualizado_por = auth.uid(), actualizado_en = now();
  end if;
  perform public._avisar_presupuesto(p_proyecto);
  perform public._evento(v_emp, 'presupuesto_guardado', jsonb_build_object('proyecto', p_proyecto, 'total', v_mo + v_ma + v_he + v_su, 'avance', p_avance));
end $$;
revoke all on function public.guardar_presupuesto(uuid, numeric, numeric, numeric, numeric, integer) from public, anon;
grant execute on function public.guardar_presupuesto(uuid, numeric, numeric, numeric, numeric, integer) to authenticated;

-- Todas las obras activas de la compañía con su presupuesto (si lo tienen) y lo real. Admin y dueño.
create or replace function public.presupuesto_resumen()
returns table (
  proyecto_id uuid, proyecto text, tiene boolean, avance integer,
  p_mano_obra numeric, p_materiales numeric, p_herramientas numeric, p_subcontratos numeric,
  r_mano_obra numeric, r_materiales numeric, r_herramientas numeric, r_subcontratos numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_gerencia() then raise exception 'No tienes permiso para esta acción' using errcode = '42501'; end if;
  return query
    select pr.id, pr.nombre::text, b.proyecto_id is not null, coalesce(b.avance, 0),
           coalesce(b.mano_obra, 0), coalesce(b.materiales, 0), coalesce(b.herramientas, 0), coalesce(b.subcontratos, 0),
           r.mano_obra, r.materiales, r.herramientas, r.subcontratos
      from proyectos pr
      left join presupuestos b on b.proyecto_id = pr.id
      cross join lateral public._presupuesto_real(pr.id) r
     where pr.empresa_id = public.mi_empresa() and pr.activo
     order by pr.nombre;
end $$;
revoke all on function public.presupuesto_resumen() from public, anon;
grant execute on function public.presupuesto_resumen() to authenticated;
