'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import {
  obtenerVehiculosActivos, reportarGastoVehiculo,
  type VehiculoCatalogo, type TipoGastoVehiculo,
} from '@/lib/vehiculos';

const ETIQUETA_TIPO: Record<TipoGastoVehiculo, string> = {
  gasolina: 'Gasolina',
  mantenimiento: 'Mantenimiento',
  reparacion: 'Reparación',
  otro: 'Otro',
};

export default function VehiculoTrabajadorPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [vehiculos, setVehiculos] = useState<VehiculoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);

  const [vehiculoId, setVehiculoId] = useState('');
  const [tipo, setTipo] = useState<TipoGastoVehiculo>('gasolina');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;
      setVehiculos(await obtenerVehiculosActivos(supabase, usuario.empresa_id));
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  async function reportar() {
    if (!vehiculoId || !monto || !usuario) {
      setError('Selecciona el vehículo y el monto.');
      return;
    }
    setGuardando(true);
    setError(null);
    const resultado = await reportarGastoVehiculo(supabase, {
      vehiculoId,
      tipo,
      monto: parseFloat(monto),
      nota: nota || undefined,
      reportadoPor: usuario.id,
    });
    setGuardando(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    setVehiculoId('');
    setMonto('');
    setNota('');
    setExito(true);
    setTimeout(() => setExito(false), 3000);
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-1">Vehículo</h1>
      <p className="text-sm text-inkSoft mb-5">Reporta lo que gastaste en gasolina o mantenimiento.</p>

      {exito && (
        <div className="bg-green-50 border border-success text-success text-sm rounded p-3 mb-4">
          Gasto reportado — gracias.
        </div>
      )}

      <div className="bg-card border border-line rounded p-4 space-y-2">
        <select
          value={vehiculoId}
          onChange={(e) => setVehiculoId(e.target.value)}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
        >
          <option value="">Selecciona el vehículo…</option>
          {vehiculos.map((v) => (
            <option key={v.id} value={v.id}>{v.nombre}{v.placa ? ` (${v.placa})` : ''}</option>
          ))}
        </select>

        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoGastoVehiculo)}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
        >
          {(Object.keys(ETIQUETA_TIPO) as TipoGastoVehiculo[]).map((t) => (
            <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>
          ))}
        </select>

        <input
          type="number"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="Monto $"
          className="w-full border border-line rounded-sm px-3 py-2 text-sm"
        />

        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional)"
          className="w-full border border-line rounded-sm px-3 py-2 text-sm"
        />

        {error && <p className="text-danger text-xs">{error}</p>}
        {vehiculos.length === 0 && (
          <p className="text-[11px] text-inkSoft">Tu empresa todavía no tiene vehículos registrados.</p>
        )}

        <button
          onClick={reportar}
          disabled={guardando}
          className="w-full bg-primary text-white rounded-sm py-3 text-sm font-bold disabled:opacity-60"
        >
          {guardando ? 'Reportando…' : 'Reportar gasto'}
        </button>
      </div>
    </>
  );
}
