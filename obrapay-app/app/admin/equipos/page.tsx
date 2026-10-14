'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { obtenerCatalogoEquipos, cambiarEstadoEquipo, type EquipoCatalogo, type EstadoEquipo } from '@/lib/equipos';

const ETIQUETA_ESTADO: Record<EstadoEquipo, string> = {
  activo: 'Activo',
  dañado: 'Dañado',
  perdido: 'Perdido',
  en_reparacion: 'En reparación',
  de_baja: 'De baja',
};

const COLOR_ESTADO: Record<EstadoEquipo, string> = {
  activo: 'bg-green-50 text-success',
  dañado: 'bg-red-50 text-danger',
  perdido: 'bg-red-50 text-danger',
  en_reparacion: 'bg-orange-50 text-warning',
  de_baja: 'bg-line text-inkSoft',
};

export default function EquiposPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [equipos, setEquipos] = useState<EquipoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [valorReemplazo, setValorReemplazo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    if (!usuario?.empresa_id) return;
    setEquipos(await obtenerCatalogoEquipos(supabase, usuario.empresa_id));
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, [supabase, usuario]);

  async function agregar() {
    if (!nombre.trim() || !usuario?.empresa_id) {
      setError('El equipo necesita un nombre.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: errorInsert } = await supabase.from('equipos_catalogo').insert({
      empresa_id: usuario.empresa_id,
      nombre: nombre.trim(),
      tipo: tipo || null,
      numero_serie: numeroSerie || null,
      valor_reemplazo: valorReemplazo ? parseFloat(valorReemplazo) : null,
    });
    setGuardando(false);
    if (errorInsert) {
      setError(errorInsert.message);
      return;
    }
    setNombre('');
    setTipo('');
    setNumeroSerie('');
    setValorReemplazo('');
    await cargar();
  }

  async function cambiarEstado(equipoId: string, estado: EstadoEquipo) {
    await cambiarEstadoEquipo(supabase, equipoId, estado);
    await cargar();
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-1">Equipo</h1>
      <p className="text-sm text-inkSoft mb-5">
        Herramientas y maquinaria que se prestan entre proyectos — asígnalas desde el detalle de cada proyecto.
      </p>

      <div className="bg-card border border-line rounded p-4 mb-5 space-y-2">
        <p className="text-[11px] font-bold uppercase text-inkSoft">Agregar equipo</p>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre — ej. Generador Honda 5000W"
          className="w-full border border-line rounded-sm px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            placeholder="Tipo (opcional)"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            value={numeroSerie}
            onChange={(e) => setNumeroSerie(e.target.value)}
            placeholder="N.º de serie (opcional)"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <input
          type="number"
          value={valorReemplazo}
          onChange={(e) => setValorReemplazo(e.target.value)}
          placeholder="Valor de reemplazo $ (opcional)"
          className="w-full border border-line rounded-sm px-3 py-2 text-sm"
        />
        {error && <p className="text-danger text-xs">{error}</p>}
        <button
          onClick={agregar}
          disabled={guardando}
          className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
        >
          {guardando ? 'Agregando…' : '+ Agregar equipo'}
        </button>
      </div>

      <div className="bg-card border border-line rounded divide-y divide-line">
        {equipos.map((e) => (
          <div key={e.id} className="px-4 py-3">
            <div className="flex justify-between items-start mb-1.5">
              <div>
                <p className="font-semibold text-sm text-ink">{e.nombre}</p>
                <p className="text-xs text-inkSoft">
                  {e.tipo}{e.numero_serie ? ` · Serie ${e.numero_serie}` : ''}
                </p>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${COLOR_ESTADO[e.estado]}`}>
                {ETIQUETA_ESTADO[e.estado]}
              </span>
            </div>
            <select
              value={e.estado}
              onChange={(ev) => cambiarEstado(e.id, ev.target.value as EstadoEquipo)}
              className="w-full border border-line rounded-sm px-2 py-1.5 text-xs bg-white mt-1"
            >
              {(Object.keys(ETIQUETA_ESTADO) as EstadoEquipo[]).map((s) => (
                <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>
              ))}
            </select>
          </div>
        ))}
        {equipos.length === 0 && (
          <p className="px-4 py-4 text-sm text-inkSoft">Todavía no has agregado ningún equipo.</p>
        )}
      </div>
    </>
  );
}
