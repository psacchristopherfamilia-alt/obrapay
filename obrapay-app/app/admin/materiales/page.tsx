'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { obtenerCatalogoMateriales, type MaterialCatalogo } from '@/lib/materiales';

export default function MaterialesPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [materiales, setMateriales] = useState<MaterialCatalogo[]>([]);
  const [loading, setLoading] = useState(true);

  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('');
  const [costo, setCosto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    if (!usuario?.empresa_id) return;
    const data = await obtenerCatalogoMateriales(supabase, usuario.empresa_id);
    setMateriales(data);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, [supabase, usuario]);

  async function agregar() {
    if (!nombre.trim() || !unidad.trim()) {
      setError('Nombre y unidad son obligatorios.');
      return;
    }
    if (!usuario?.empresa_id) return;

    setGuardando(true);
    setError(null);
    const { error: errorInsert } = await supabase.from('materiales_catalogo').insert({
      empresa_id: usuario.empresa_id,
      nombre: nombre.trim(),
      unidad: unidad.trim(),
      costo_referencial: costo ? parseFloat(costo) : null,
    });
    setGuardando(false);

    if (errorInsert) {
      setError(errorInsert.message);
      return;
    }
    setNombre('');
    setUnidad('');
    setCosto('');
    await cargar();
  }

  async function toggleActivo(m: MaterialCatalogo) {
    await supabase.from('materiales_catalogo').update({ activo: !m.activo }).eq('id', m.id);
    await cargar();
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-1">Materiales</h1>
      <p className="text-sm text-inkSoft mb-5">
        El catálogo de aquí es lo que aparece al registrar una compra en cada proyecto.
      </p>

      <div className="bg-card border border-line rounded p-4 mb-5 space-y-2">
        <p className="text-[11px] font-bold uppercase text-inkSoft">Agregar material</p>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre — ej. Cemento gris"
          className="w-full border border-line rounded-sm px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            placeholder="Unidad — ej. saco, galón, pie"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            placeholder="Costo ref. (opcional)"
            className="w-36 border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-danger text-xs">{error}</p>}
        <button
          onClick={agregar}
          disabled={guardando}
          className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
        >
          {guardando ? 'Agregando…' : '+ Agregar al catálogo'}
        </button>
      </div>

      <div className="bg-card border border-line rounded divide-y divide-line">
        {materiales.map((m) => (
          <div key={m.id} className="flex justify-between items-center px-4 py-3">
            <div>
              <p className={`text-sm font-semibold ${m.activo ? 'text-ink' : 'text-inkSoft line-through'}`}>{m.nombre}</p>
              <p className="text-xs text-inkSoft">
                por {m.unidad}{m.costo_referencial ? ` · ref. $${m.costo_referencial.toFixed(2)}` : ''}
              </p>
            </div>
            <button onClick={() => toggleActivo(m)} className="text-[11px] font-bold text-primary">
              {m.activo ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
        ))}
        {materiales.length === 0 && (
          <p className="px-4 py-3 text-sm text-inkSoft">Todavía no has agregado ningún material.</p>
        )}
      </div>
    </>
  );
}
