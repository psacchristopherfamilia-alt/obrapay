import { createClient } from '@supabase/supabase-js';

/**
 * Usa la SERVICE ROLE KEY — se salta RLS por completo.
 * Importar este archivo únicamente desde código que corre en el servidor
 * ('use server', route handlers). Si esto llega a un componente de cliente,
 * la key quedaría expuesta en el bundle del navegador.
 */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // sin NEXT_PUBLIC_ — server-only
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
