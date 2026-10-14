-- ObraPay · Los trabajadores quedan habilitados automáticamente en todas las compañías del mismo dueño.
-- Ya no hace falta "compartir": basta asignar al trabajador a un proyecto de cualquiera de las dos y sus horas
-- cuentan para la compañía de ese proyecto. Supervisores, admin y dueño NO se habilitan solos (siguen viendo
-- solo la compañía en la que están); a ellos se les da acceso explícito.
--
-- "Compañías hermanas" de una compañía = las que comparten con ella al menos un admin o dueño activo.
-- Así una cuenta nueva sin relación nunca queda mezclada con las demás.

create or replace function public.empresas_hermanas(p_empresa uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct m2.empresa_id
  from perfil_empresas m1
  join perfiles p on p.id = m1.perfil_id and p.activo and (p.roles && array['admin', 'dueno']::text[])
  join perfil_empresas m2 on m2.perfil_id = m1.perfil_id and m2.baja_en is null and m2.empresa_id <> p_empresa
  where m1.empresa_id = p_empresa and m1.baja_en is null
$$;
revoke all on function public.empresas_hermanas(uuid) from public, anon, authenticated;

-- Persona nueva que solo es trabajador: entra a las compañías hermanas de la suya.
create or replace function public._tr_perfil_membresia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfil_empresas (perfil_id, empresa_id) values (new.id, new.empresa_id) on conflict do nothing;
  if new.roles <@ array['trabajador']::text[] then
    insert into perfil_empresas (perfil_id, empresa_id)
    select new.id, h from public.empresas_hermanas(new.empresa_id) h
    on conflict do nothing;
  end if;
  return new;
end $$;

-- Al crear la tarifa de su compañía de inicio, se copia a las otras donde aún no tiene (luego son independientes).
create or replace function public._tr_tarifa_hermanas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.empresa_id = (select empresa_id from perfiles where id = new.perfil_id) then
    insert into tarifas (empresa_id, perfil_id, monto_hora, vigente_desde, creado_por)
    select m.empresa_id, new.perfil_id, new.monto_hora, new.vigente_desde, new.creado_por
    from perfil_empresas m
    where m.perfil_id = new.perfil_id and m.baja_en is null and m.empresa_id <> new.empresa_id
      and not exists (select 1 from tarifas t where t.perfil_id = new.perfil_id and t.empresa_id = m.empresa_id)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger tarifa_hermanas after insert on public.tarifas
  for each row execute function public._tr_tarifa_hermanas();

-- Los trabajadores que ya existen (solo trabajador, activos, sin baja marcada) quedan habilitados en las hermanas,
-- con la misma tarifa de su compañía de inicio.
insert into public.perfil_empresas (perfil_id, empresa_id)
select p.id, h
from public.perfiles p
cross join lateral public.empresas_hermanas(p.empresa_id) h
where p.activo and p.roles <@ array['trabajador']::text[]
  and not exists (select 1 from public.perfil_empresas x where x.perfil_id = p.id and x.empresa_id = h)
on conflict do nothing;

insert into public.tarifas (empresa_id, perfil_id, monto_hora, vigente_desde)
select m.empresa_id, p.id, t.monto_hora, t.vigente_desde
from public.perfiles p
join public.perfil_empresas m on m.perfil_id = p.id and m.baja_en is null and m.empresa_id <> p.empresa_id
cross join lateral (select monto_hora, vigente_desde from public.tarifas
                    where perfil_id = p.id and empresa_id = p.empresa_id order by vigente_desde desc limit 1) t
where p.roles <@ array['trabajador']::text[]
  and not exists (select 1 from public.tarifas x where x.perfil_id = p.id and x.empresa_id = m.empresa_id)
on conflict do nothing;
