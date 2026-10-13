'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import type { MetodoPago } from '@/types/database';

interface FilaTrabajador {
  id: string;
  nombre: string;
  rol: string;
  oficio: string;
  tarifa_hora: number;
  metodo_pago: MetodoPago;
  saldo_prestamo: number;
}

const ETIQUETA_PAGO: Record<MetodoPago, string> = {
  transfer: 'Transferencia bancaria',
  cash: 'Efectivo',
  check: 'Cheque',
  wallet: 'Billetera móvil',
};

export default function TrabajadoresPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [filas, setFilas] = useState<FilaTrabajador[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroPago, setFiltroPago] = useState<MetodoPago | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;

      const { data } = await supabase
        .from('usuarios')
        .select('id, nombre, rol, perfil_nomina(oficio, tarifa_hora, metodo_pago), prestamos(saldo_pendiente, estado)')
        .eq('empresa_id', usuario.empresa_id)
        .in('rol', ['trabajador', 'supervisor']);

      setFilas(
        (data ?? []).map((u: any) => ({
          id: u.id,
          nombre: u.nombre,
          rol: u.rol,
          oficio: u.perfil_nomina?.oficio ?? '—',
          tarifa_hora: u.perfil_nomina?.tarifa_hora ?? 0,
          metodo_pago: u.perfil_nomina?.metodo_pago ?? 'transfer',
          saldo_prestamo: (u.prestamos ?? []).find((p: any) => p.estado === 'activo')?.saldo_pendiente ?? 0,
        }))
      );
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter(
      (f) =>
        (!q || f.nombre.toLowerCase().includes(q) || f.oficio.toLowerCase().includes(q)) &&
        (filtroPago === 'all' || f.metodo_pago === filtroPago)
    );
  }, [filas, busqueda, filtroPago]);

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <div className="flex gap-2 mb-4">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar trabajador..."
          className="flex-1 border border-line rounded-sm px-3 py-2.5 text-sm"
        />
        <Link
          href="/admin/trabajadores/nuevo"
          className="bg-primary text-white text-xs font-bold px-3 py-2.5 rounded-sm whitespace-nowrap"
        >
          + Nuevo trabajador
        </Link>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        {(['all', 'transfer', 'cash', 'check', 'wallet'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setFiltroPago(m)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
              filtroPago === m ? 'bg-charcoal text-white border-charcoal' : 'border-line text-ink'
            }`}
          >
            {m === 'all' ? 'Todos' : ETIQUETA_PAGO[m]}
          </button>
        ))}
      </div>

      <div className="bg-card border border-line rounded divide-y divide-line">
        {filtradas.map((f) => (
          <Link key={f.id} href={`/admin/trabajadores/${f.id}`} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 text-primary flex items-center justify-center text-xs font-bold">
                {f.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <p className="font-semibold text-sm text-ink">{f.nombre}</p>
                <p className="text-xs text-inkSoft">
                  {f.oficio} · ${f.tarifa_hora.toFixed(2)}/h {f.rol === 'supervisor' ? '· Supervisor' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-steel-soft text-steel text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap">
                {ETIQUETA_PAGO[f.metodo_pago]}
              </span>
              {f.saldo_prestamo > 0 && (
                <span className="bg-orange-50 text-warning text-[10px] font-bold px-2 py-1 rounded-full">
                  ${f.saldo_prestamo}
                </span>
              )}
            </div>
          </Link>
        ))}
        {filtradas.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">Sin resultados.</p>}
      </div>
    </>
  );
}
