-- ============================================================================
-- 011 — Corrige recursión infinita en RLS (bug de raíz desde el esquema
-- original)
--
-- empresa_actual(), es_admin() y proyectos_a_cargo() consultan la tabla
-- usuarios. Pero la política de usuarios (usuarios_acceso) usa
-- empresa_actual() para decidir qué filas se pueden leer. Como ninguna de
-- las funciones era SECURITY DEFINER, su consulta interna a usuarios
-- vuelve a pasar por RLS — que vuelve a llamar a la función — que vuelve
-- a consultar usuarios... Postgres corta esto con el error "infinite
-- recursion detected in policy for relation \"usuarios\"", y eso rompe
-- CUALQUIER política de CUALQUIER tabla que dependa de estas funciones
-- (es decir, casi todas).
--
-- La solución estándar (y la que usa la documentación de Supabase para
-- este patrón exacto): marcar las funciones como SECURITY DEFINER, para
-- que su consulta interna a usuarios corra sin pasar por RLS de nuevo.
-- Son funciones de solo lectura sin efectos secundarios, así que esto no
-- abre ningún hueco — solo evita que se muerdan la cola a sí mismas.
-- ============================================================================

create or replace function empresa_actual()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select empresa_id from usuarios where id = auth.uid()
$$;

create or replace function es_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios where id = auth.uid() and rol = 'owner'
  )
$$;

create or replace function es_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and rol = 'admin' and empresa_id = empresa_actual()
  )
$$;

create or replace function proyectos_a_cargo()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select id from proyectos where supervisor_principal_id = auth.uid()
  union
  select proyecto_id from proyecto_supervisores where usuario_id = auth.uid()
$$;
