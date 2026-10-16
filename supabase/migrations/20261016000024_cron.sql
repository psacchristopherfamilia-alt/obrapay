-- Revisión diaria de presupuestos (avisos al 50, 75, 90 y 100 %), 13:15 UTC (9:15 a. m. en Turks and Caicos).
-- Solo existe en Supabase.
do $$ begin
  perform cron.schedule('obrapay-avisar-presupuestos', '15 13 * * *', 'select public.avisar_presupuestos();');
end $$;
