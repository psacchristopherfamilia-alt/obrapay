-- Avisos diarios para el admin (documentos por vencer y mantenimiento de vehículos), a las 13:00 UTC (9 a. m. en Turks and Caicos).
-- Solo existe en Supabase.
do $$ begin
  perform cron.schedule('obrapay-avisar-documentos', '5 13 * * *', 'select public.avisar_documentos();');
  perform cron.schedule('obrapay-avisar-vehiculos', '10 13 * * *', 'select public.avisar_vehiculos();');
end $$;
