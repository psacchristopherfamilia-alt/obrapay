-- Reinicia la demostración cada noche, 07:30 UTC (3:30 a. m. en Turks and Caicos). Solo existe en Supabase.
do $$ begin
  perform cron.schedule('obrapay-demo-reinicio', '30 7 * * *', 'select public._demo_reiniciar_auto();');
end $$;
