-- ============================================================================
-- 028 — Marcar facturas vencidas automáticamente
-- Sin esto, una factura pasada de fecha se queda mostrando "pendiente"
-- para siempre — nadie se entera de que ya venció sin revisarlas una por
-- una.
-- ============================================================================

create or replace function marcar_facturas_vencidas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update facturas
    set estado = 'vencida'
    where estado = 'pendiente' and fecha_vencimiento is not null and fecha_vencimiento < current_date;
end;
$$;

select cron.schedule('marcar-facturas-vencidas', '0 6 * * *', $$select marcar_facturas_vencidas();$$);

revoke execute on function marcar_facturas_vencidas() from public, authenticated, anon;
