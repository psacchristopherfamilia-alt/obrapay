-- Aviso diario de remesas por vencer (13:00 UTC). Solo existe en Supabase (pg_cron); las pruebas locales lo omiten.
do $$ begin perform cron.schedule('obrapay-avisar-remesas', '0 13 * * *', 'select public.avisar_remesas();'); end $$;
