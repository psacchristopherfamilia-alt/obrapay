-- Avisos diarios de documentos por vencer para el admin, a las 13:00 UTC (9 a. m. en Turks and Caicos). Solo existe en Supabase.
do $$ begin perform cron.schedule('obrapay-avisar-documentos', '5 13 * * *', 'select public.avisar_documentos();'); end $$;
