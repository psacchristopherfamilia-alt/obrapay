'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';

interface Notificacion {
  id: string;
  tipo: string;
  mensaje: string;
  leido: boolean;
  creado_en: string;
}

function tiempoRelativo(iso: string) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas}h`;
  return `hace ${Math.floor(horas / 24)}d`;
}

function iconoPara(tipo: string) {
  if (tipo.includes('tarifa')) return '💰';
  if (tipo.includes('prestamo')) return '📄';
  if (tipo.includes('cierre') || tipo.includes('semana')) return '🔔';
  return '📌';
}

export default function AvisosPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [avisos, setAvisos] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    const { data } = await supabase
      .from('notificaciones')
      .select('id, tipo, mensaje, leido, creado_en')
      .eq('usuario_id', usuario.id)
      .order('creado_en', { ascending: false })
      .limit(30);
    setAvisos(data ?? []);
    setLoading(false);
  }, [supabase, usuario]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function marcarLeido(id: string) {
    setAvisos((prev) => prev.map((a) => (a.id === id ? { ...a, leido: true } : a)));
    await supabase.from('notificaciones').update({ leido: true }).eq('id', id);
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-4">Avisos</h1>

      <div className="bg-card border border-line rounded divide-y divide-line">
        {avisos.map((a) => (
          <button
            key={a.id}
            onClick={() => marcarLeido(a.id)}
            className="w-full flex gap-3 px-4 py-3 text-left"
          >
            <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-base flex-shrink-0">
              {iconoPara(a.tipo)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${a.leido ? 'text-inkSoft' : 'font-bold text-ink'}`}>{a.mensaje}</p>
              <p className="text-[11px] text-inkSoft mt-0.5">{tiempoRelativo(a.creado_en)}</p>
            </div>
            {!a.leido && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
          </button>
        ))}
        {avisos.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">No tienes avisos todavía.</p>}
      </div>
    </>
  );
}
