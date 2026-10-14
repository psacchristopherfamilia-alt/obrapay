'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface Oficio {
  id: string;
  nombre: string;
}

export default function AjustesSistemaPage() {
  const supabase = supabaseBrowser();
  const [f, setF] = useState({ permitir_registro_empresas: true, modo_mantenimiento: false, umbral_extra_default: '17:00' });
  const [oficios, setOficios] = useState<Oficio[]>([]);
  const [nuevoOficio, setNuevoOficio] = useState('');
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const [{ data: config }, { data: oficiosDb }] = await Promise.all([
      supabase.from('configuracion_sistema').select('*').eq('id', true).maybeSingle(),
      supabase.from('catalogo_oficios').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    if (config) setF(config);
    setOficios(oficiosDb ?? []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function guardar() {
    setGuardando(true);
    const { error } = await supabase.from('configuracion_sistema').upsert({ id: true, ...f });
    setGuardando(false);
    if (error) alert('No se pudo guardar: ' + error.message);
  }

  async function agregarOficio() {
    if (!nuevoOficio.trim()) return;
    const { error } = await supabase.from('catalogo_oficios').insert({ nombre: nuevoOficio.trim() });
    if (error) {
      alert('No se pudo agregar: ' + error.message);
      return;
    }
    setNuevoOficio('');
    await cargar();
  }

  async function quitarOficio(id: string) {
    // Se desactiva en vez de borrar — así no rompe registros históricos que
    // ya usan ese oficio.
    const { error } = await supabase.from('catalogo_oficios').update({ activo: false }).eq('id', id);
    if (error) alert('No se pudo quitar: ' + error.message);
    await cargar();
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  const Toggle = ({ valor, onChange }: { valor: boolean; onChange: () => void }) => (
    <button onClick={onChange} className={`w-10 h-5.5 rounded-full relative ${valor ? 'bg-primary' : 'bg-line'}`}>
      <span className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform ${valor ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );

  return (
    <>
      <div className="bg-card border border-line rounded p-4 space-y-3 mb-4">
        <p className="text-[11px] font-bold uppercase text-inkSoft mb-1">Valores por defecto del sistema</p>
        <div className="flex justify-between items-center">
          <span className="text-sm">Permitir registro de nuevas empresas</span>
          <Toggle valor={f.permitir_registro_empresas} onChange={() => setF({ ...f, permitir_registro_empresas: !f.permitir_registro_empresas })} />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm">Modo mantenimiento</span>
          <Toggle valor={f.modo_mantenimiento} onChange={() => setF({ ...f, modo_mantenimiento: !f.modo_mantenimiento })} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">
            Umbral de hora extra por defecto (nuevas empresas)
          </label>
          <input
            value={f.umbral_extra_default}
            onChange={(e) => setF({ ...f, umbral_extra_default: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <button onClick={guardar} disabled={guardando} className="bg-primary text-white text-sm font-bold px-5 py-3 rounded-sm disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-3">
        Catálogo global de oficios
      </p>
      <div className="bg-card border border-line rounded p-4">
        <div className="flex gap-1.5 flex-wrap mb-4">
          {oficios.map((o) => (
            <span key={o.id} className="flex items-center gap-1.5 bg-charcoal text-white text-xs font-semibold px-3 py-1.5 rounded-full">
              {o.nombre}
              <button onClick={() => quitarOficio(o.id)} className="font-bold leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={nuevoOficio}
            onChange={(e) => setNuevoOficio(e.target.value)}
            placeholder="Ej. Grúa / Crane operator"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
          <button onClick={agregarOficio} className="bg-steel text-white text-xs font-bold px-4 rounded-sm">
            Agregar
          </button>
        </div>
        <p className="text-[11px] text-inkSoft mt-2">
          Este catálogo alimenta el formulario "+ Nuevo trabajador" en todas las empresas de la plataforma.
        </p>
      </div>
    </>
  );
}
