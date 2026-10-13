'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { fmtUSD } from '@/lib/admin';

interface FilaPago {
  id: string;
  usuario_id: string;
  nombre: string;
  horas_normales: number;
  horas_extra: number;
  bruto: number;
  descuento_seguro: number;
  saldo_prestamo: number; // saldo actual del préstamo activo, para sugerir el monto
}

export default function ConfirmarPagosPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [filas, setFilas] = useState<FilaPago[]>([]);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!usuario?.empresa_id) return;

    const { data } = await supabase
      .from('pagos_semanales')
      .select(
        'id, usuario_id, horas_normales, horas_extra, bruto, descuento_seguro, usuarios(nombre, empresa_id, prestamos(saldo_pendiente, estado))'
      )
      .eq('estado', 'pendiente')
      .eq('usuarios.empresa_id', usuario.empresa_id);

    setFilas(
      (data ?? [])
        .filter((p: any) => p.usuarios) // el filtro de empresa vía join a veces deja null
        .map((p: any) => ({
          id: p.id,
          usuario_id: p.usuario_id,
          nombre: p.usuarios.nombre,
          horas_normales: Number(p.horas_normales),
          horas_extra: Number(p.horas_extra),
          bruto: Number(p.bruto),
          descuento_seguro: Number(p.descuento_seguro),
          saldo_prestamo: (p.usuarios.prestamos ?? []).find((pr: any) => pr.estado === 'activo')?.saldo_pendiente ?? 0,
        }))
    );
    setLoading(false);
  }, [supabase, usuario]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function confirmar(fila: FilaPago) {
    const monto = parseFloat(montos[fila.id] ?? '0') || 0;
    if (monto > fila.saldo_prestamo) {
      alert(`El descuento no puede ser mayor al saldo del préstamo (${fmtUSD(fila.saldo_prestamo)}).`);
      return;
    }
    setConfirmandoId(fila.id);
    const { error } = await supabase.rpc('confirmar_pago_semanal', {
      p_pago_id: fila.id,
      p_descuento_prestamo: monto,
    });
    setConfirmandoId(null);

    if (error) {
      alert('No se pudo confirmar: ' + error.message);
      return;
    }
    await cargar();
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <a href="/admin/reportes" className="text-xs text-inkSoft">← Volver a Reportes</a>
      <h1 className="font-heading font-extrabold text-2xl text-ink mt-2 mb-1">Confirmar pagos</h1>
      <p className="text-sm text-inkSoft mb-5">
        {filas.length} pago{filas.length !== 1 ? 's' : ''} en borrador — revisa el descuento de préstamo antes de confirmar.
      </p>

      {filas.length === 0 && (
        <p className="text-sm text-inkSoft">No hay pagos pendientes de confirmar. Cierra la semana desde el Panel primero.</p>
      )}

      <div className="space-y-3">
        {filas.map((f) => {
          const horas = f.horas_normales + f.horas_extra;
          const montoIngresado = parseFloat(montos[f.id] ?? '0') || 0;
          const neto = f.bruto - f.descuento_seguro - montoIngresado;

          return (
            <div key={f.id} className="bg-card border border-line rounded p-4">
              <p className="font-bold text-sm text-ink mb-1">{f.nombre}</p>
              <p className="text-xs text-inkSoft mb-3">
                {horas.toFixed(1)}h · Bruto {fmtUSD(f.bruto)} · Seguro -{fmtUSD(f.descuento_seguro)}
              </p>

              {f.saldo_prestamo > 0 ? (
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-inkSoft mb-1">
                    Descuento de préstamo esta semana (saldo: {fmtUSD(f.saldo_prestamo)})
                  </label>
                  <input
                    type="number"
                    value={montos[f.id] ?? ''}
                    onChange={(e) => setMontos({ ...montos, [f.id]: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <p className="text-xs text-inkSoft mb-3">Sin préstamo activo.</p>
              )}

              <div className="flex justify-between items-center border-t border-line pt-2.5 mb-3">
                <span className="text-sm font-bold text-ink">Neto a pagar</span>
                <span className="font-heading font-extrabold text-lg text-ink">{fmtUSD(neto)}</span>
              </div>

              <button
                onClick={() => confirmar(f)}
                disabled={confirmandoId === f.id}
                className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-sm disabled:opacity-60"
              >
                {confirmandoId === f.id ? 'Confirmando…' : 'Confirmar pago'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
