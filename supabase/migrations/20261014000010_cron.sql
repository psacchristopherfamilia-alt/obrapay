-- Avisos diarios para el admin a las 13:00 UTC (9 a. m. en Turks and Caicos). Solo existe en Supabase.
do $$ begin perform cron.schedule('obrapay-avisar-pendientes', '0 13 * * *', 'select public.avisar_pendientes();'); end $$;
