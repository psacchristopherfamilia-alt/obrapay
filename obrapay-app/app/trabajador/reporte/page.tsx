'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { fmtUSD } from '@/lib/admin';

interface EntradaSemana {
  id: string;
  hora_entrada: string;
  horas_normales: number;
  horas_extra: number;
  estado: string;
  proyectos: { nombre: string } | null;
}

interface PagoHistorico {
  id: string;
  horas_normales: number;
  horas_extra: number;
  bruto: number;
  descuento_seguro: number;
  descuento_prestamo: number;
  neto: number;
  estado: string;
  semanas_pago: { fecha_inicio: string } | null;
}

const ETIQUETA_PAGO: Record<string, string> = {
  transfer: 'Transferencia bancaria',
  cash: 'Efectivo',
  check: 'Cheque',
  wallet: 'Billetera móvil',
};

export default function MiReportePage() {
  const supabase = supabaseBrowser();
  const { usuario, perfil } = useUsuarioActual();
  const [entradas, setEntradas] = useState<EntradaSemana[]>([]);
  const [semanaAbierta, setSemanaAbierta] = useState<{ fecha_inicio: string; fecha_cierre: string } | null>(null);
  const [historial, setHistorial] = useState<PagoHistorico[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;

      const { data: semana } = await supabase
        .from('semanas_pago')
        .select('id, fecha_inicio, fecha_cierre')
        .eq('empresa_id', usuario.empresa_id)
        .eq('estado', 'abierta')
        .single();

      if (semana) {
        setSemanaAbierta(semana);
        const { data: filas } = await supabase
          .from('registros_horas')
          .select('id, hora_entrada, horas_normales, horas_extra, estado, proyectos(nombre)')
          .eq('usuario_id', usuario.id)
          .eq('semana_id', semana.id)
          .order('hora_entrada', { ascending: true });
        setEntradas((filas as any) ?? []);
      }

      const { data: pagos } = await supabase
        .from('pagos_semanales')
        .select('id, horas_normales, horas_extra, bruto, descuento_seguro, descuento_prestamo, neto, estado, semanas_pago(fecha_inicio)')
        .eq('usuario_id', usuario.id)
        .order('semana_id', { ascending: false })
        .limit(10);
      setHistorial((pagos as any) ?? []);

      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  const totalNormales = entradas.reduce((s, e) => s + Number(e.horas_normales), 0);
  const totalExtra = entradas.reduce((s, e) => s + Number(e.horas_extra), 0);
  const brutoEstimado = (totalNormales + totalExtra) * (perfil?.tarifa_hora ?? 0);

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h1 className="font-heading font-extrabold text-xl text-ink">
          {semanaAbierta ? `Semana del ${new Date(semanaAbierta.fecha_inicio).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}` : 'Sin semana abierta'}
        </h1>
        {semanaAbierta && (
          <span className="bg-orange-50 text-warning text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
            Abierta hasta el cierre
          </span>
        )}
      </div>

      {semanaAbierta && (
        <>
          <div className="bg-card border border-line rounded overflow-hidden mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-inkSoft border-b border-line">
                  <th className="py-2 pl-3 font-semibold">Día</th>
                  <th className="font-semibold">Proyecto</th>
                  <th className="font-semibold pr-3">Horas</th>
                </tr>
              </thead>
              <tbody>
                {entradas.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pl-3">
                      {new Date(e.hora_entrada).toLocaleDateString('es-DO', { weekday: 'short' })}
                    </td>
                    <td>{e.proyectos?.nombre}</td>
                    <td className="pr-3">{(Number(e.horas_normales) + Number(e.horas_extra)).toFixed(1)}h</td>
                  </tr>
                ))}
                {entradas.length === 0 && (
                  <tr><td colSpan={3} className="py-3 pl-3 text-inkSoft">Aún no has marcado horas esta semana.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-card border border-line rounded p-4 mb-4">
            <div className="flex justify-between text-sm py-1.5 border-b border-dashed border-line">
              <span className="text-inkSoft">Horas normales</span><span>{totalNormales.toFixed(1)}h</span>
            </div>
            <div className="flex justify-between text-sm py-1.5 border-b border-dashed border-line">
              <span className="text-inkSoft">Horas después del horario normal</span><span>{totalExtra.toFixed(1)}h</span>
            </div>
            <div className="flex justify-between text-sm py-1.5">
              <span className="text-inkSoft">Bruto estimado</span><span className="font-bold">{fmtUSD(brutoEstimado)}</span>
            </div>
            <p className="text-[11px] text-inkSoft mt-2">
              El seguro y el préstamo (si aplica) se calculan cuando se cierre la semana.
            </p>
          </div>
        </>
      )}

      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-3">
        Historial de pagos
      </p>
      <div className="space-y-2">
        {historial.map((p) => (
          <div key={p.id} className="bg-card border border-line rounded p-3">
            <div className="flex justify-between items-center mb-1">
              <p className="font-bold text-sm text-ink">
                {p.semanas_pago ? new Date(p.semanas_pago.fecha_inicio).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }) : '—'}
              </p>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${p.estado === 'pagado' ? 'bg-green-50 text-success' : 'bg-orange-50 text-warning'}`}>
                {p.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
              </span>
            </div>
            <p className="text-xs text-inkSoft">
              {(Number(p.horas_normales) + Number(p.horas_extra)).toFixed(1)}h · Neto {fmtUSD(p.neto)}
            </p>
          </div>
        ))}
        {historial.length === 0 && <p className="text-sm text-inkSoft">Sin pagos anteriores todavía.</p>}
      </div>

      {perfil && (
        <div className="flex items-center justify-between bg-card border border-line rounded p-3 mt-4">
          <span className="text-xs text-inkSoft">Se le paga por</span>
          <span className="text-xs font-bold text-ink">{ETIQUETA_PAGO[perfil.metodo_pago]}</span>
        </div>
      )}
    </>
  );
}
