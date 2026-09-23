'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { obtenerTotalHistorico, type TotalHistorico } from '@/lib/nomina';
import { fmtUSD } from '@/lib/admin';

const ETIQUETA_PAGO: Record<string, string> = {
  transfer: 'Transferencia bancaria',
  cash: 'Efectivo',
  check: 'Cheque',
  wallet: 'Billetera móvil',
};

export default function PerfilPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const { usuario, perfil, loading } = useUsuarioActual();
  const [total, setTotal] = useState<TotalHistorico | null>(null);

  useEffect(() => {
    async function cargar() {
      if (!usuario) return;
      setTotal(await obtenerTotalHistorico(supabase, usuario.id));
    }
    cargar();
  }, [supabase, usuario]);

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink">{usuario?.nombre}</h1>
      <p className="text-sm text-inkSoft mb-1">{perfil?.oficio}</p>
      {usuario?.creado_en && (
        <p className="text-xs text-inkSoft mb-5">
          Trabajando aquí desde {new Date(usuario.creado_en).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })}
        </p>
      )}

      {total && total.semanasPagadas > 0 && (
        <div className="bg-charcoal rounded p-4 mb-4">
          <p className="text-[11px] font-bold uppercase text-blue-200 mb-1">Total ganado desde que trabajas aquí</p>
          <p className="font-heading font-extrabold text-3xl text-white">{fmtUSD(total.netoTotal)}</p>
          <p className="text-xs text-blue-200 mt-1">
            {total.horasTotales.toFixed(0)}h trabajadas en {total.semanasPagadas} semana{total.semanasPagadas !== 1 ? 's' : ''} pagadas
          </p>
          <div className="border-t border-white/20 mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-xs text-blue-200">
              <span>Bruto total</span><span>{fmtUSD(total.brutoTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-blue-200">
              <span>Descontado por seguro</span><span>-{fmtUSD(total.descuentoSeguroTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-blue-200">
              <span>Descontado por préstamos</span><span>-{fmtUSD(total.descuentoPrestamoTotal)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-line rounded p-4 mb-4">
        <div className="flex justify-between text-sm py-2 border-b border-dashed border-line">
          <span className="text-inkSoft">Tarifa por hora</span>
          <span className="font-semibold">${perfil?.tarifa_hora.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm py-2 border-b border-dashed border-line">
          <span className="text-inkSoft">% de seguro</span>
          <span className="font-semibold">{perfil?.porcentaje_seguro}%</span>
        </div>
        <div className="flex justify-between text-sm py-2">
          <span className="text-inkSoft">Método de pago</span>
          <span className="font-semibold">{perfil ? ETIQUETA_PAGO[perfil.metodo_pago] : '—'}</span>
        </div>
      </div>

      <button
        onClick={cerrarSesion}
        className="w-full border border-line rounded-sm py-3 text-sm font-bold text-ink"
      >
        Cerrar sesión
      </button>
    </>
  );
}
