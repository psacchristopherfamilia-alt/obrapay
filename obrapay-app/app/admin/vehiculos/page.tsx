'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { fmtUSD } from '@/lib/admin';
import {
  obtenerCatalogoVehiculos, cambiarEstadoVehiculo, actualizarMantenimiento, totalGastosPorVehiculo,
  type VehiculoCatalogo, type EstadoVehiculo,
} from '@/lib/vehiculos';

const ETIQUETA_ESTADO: Record<EstadoVehiculo, string> = {
  activo: 'Activo',
  en_reparacion: 'En reparación',
  de_baja: 'De baja',
};

const COLOR_ESTADO: Record<EstadoVehiculo, string> = {
  activo: 'bg-green-50 text-success',
  en_reparacion: 'bg-orange-50 text-warning',
  de_baja: 'bg-line text-inkSoft',
};

export default function VehiculosPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [vehiculos, setVehiculos] = useState<VehiculoCatalogo[]>([]);
  const [gastos, setGastos] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [nombre, setNombre] = useState('');
  const [placa, setPlaca] = useState('');
  const [tipo, setTipo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    if (!usuario?.empresa_id) return;
    const lista = await obtenerCatalogoVehiculos(supabase, usuario.empresa_id);
    setVehiculos(lista);
    setGastos(await totalGastosPorVehiculo(supabase, lista.map((v) => v.id)));
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, [supabase, usuario]);

  async function agregar() {
    if (!nombre.trim() || !usuario?.empresa_id) {
      setError('El vehículo necesita un nombre.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: errorInsert } = await supabase.from('vehiculos_catalogo').insert({
      empresa_id: usuario.empresa_id,
      nombre: nombre.trim(),
      placa: placa || null,
      tipo: tipo || null,
    });
    setGuardando(false);
    if (errorInsert) {
      setError(errorInsert.message);
      return;
    }
    setNombre('');
    setPlaca('');
    setTipo('');
    await cargar();
  }

  async function cambiarEstado(id: string, estado: EstadoVehiculo) {
    await cambiarEstadoVehiculo(supabase, id, estado);
    await cargar();
  }

  async function cambiarMantenimiento(id: string, fecha: string) {
    await actualizarMantenimiento(supabase, id, fecha || null);
    await cargar();
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-1">Vehículos</h1>
      <p className="text-sm text-inkSoft mb-5">
        Asígnalos a un proyecto desde su detalle. Cualquier trabajador puede reportar gasolina.
      </p>

      <div className="bg-card border border-line rounded p-4 mb-5 space-y-2">
        <p className="text-[11px] font-bold uppercase text-inkSoft">Agregar vehículo</p>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre — ej. Camión Ford F-150"
          className="w-full border border-line rounded-sm px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={placa}
            onChange={(e) => setPlaca(e.target.value)}
            placeholder="Placa (opcional)"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            placeholder="Tipo (opcional)"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-danger text-xs">{error}</p>}
        <button
          onClick={agregar}
          disabled={guardando}
          className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
        >
          {guardando ? 'Agregando…' : '+ Agregar vehículo'}
        </button>
      </div>

      <div className="bg-card border border-line rounded divide-y divide-line">
        {vehiculos.map((v) => {
          const vencido = v.proximo_mantenimiento && new Date(v.proximo_mantenimiento) <= new Date();
          return (
            <div key={v.id} className="px-4 py-3">
              <div className="flex justify-between items-start mb-1.5">
                <div>
                  <p className="font-semibold text-sm text-ink">{v.nombre}</p>
                  <p className="text-xs text-inkSoft">
                    {v.placa}{v.tipo ? ` · ${v.tipo}` : ''} · gastado {fmtUSD(gastos.get(v.id) ?? 0)}
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${COLOR_ESTADO[v.estado]}`}>
                  {ETIQUETA_ESTADO[v.estado]}
                </span>
              </div>
              <div className="flex gap-2 mt-1">
                <select
                  value={v.estado}
                  onChange={(e) => cambiarEstado(v.id, e.target.value as EstadoVehiculo)}
                  className="flex-1 border border-line rounded-sm px-2 py-1.5 text-xs bg-white"
                >
                  {(Object.keys(ETIQUETA_ESTADO) as EstadoVehiculo[]).map((s) => (
                    <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={v.proximo_mantenimiento ?? ''}
                  onChange={(e) => cambiarMantenimiento(v.id, e.target.value)}
                  title="Próximo mantenimiento"
                  className={`flex-1 border rounded-sm px-2 py-1.5 text-xs ${vencido ? 'border-danger text-danger' : 'border-line'}`}
                />
              </div>
            </div>
          );
        })}
        {vehiculos.length === 0 && (
          <p className="px-4 py-4 text-sm text-inkSoft">Todavía no has agregado ningún vehículo.</p>
        )}
      </div>
    </>
  );
}
