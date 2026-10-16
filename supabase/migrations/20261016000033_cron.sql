-- Respaldo diario de todas las compañías, 07:00 UTC (3:00 a. m. en Turks and Caicos).
-- Solo existe en Supabase.
do $$ begin
  perform cron.schedule('obrapay-respaldo-diario', '0 7 * * *', 'select public._hacer_respaldo(''auto'');');
end $$;
