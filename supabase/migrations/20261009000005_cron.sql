-- ObraPay · Tareas programadas (solo en Supabase; requiere la extensión pg_cron).
-- Corre cada 5 minutos; las funciones revisan la hora local de cada empresa, así el horario de verano
-- de Turks and Caicos no mueve los cierres.
--   1. Turnos olvidados → se cierran a la hora configurada (11:00 p.m.) y quedan para que el supervisor corrija.
--   2. Semanas → se congelan después del miércoles 11:59 p.m. y se abre la siguiente.
create extension if not exists pg_cron;

select cron.schedule(
  'obrapay-cierres',
  '*/5 * * * *',
  $$select public.cerrar_turnos_olvidados(); select public.cerrar_semanas_vencidas();$$
);
