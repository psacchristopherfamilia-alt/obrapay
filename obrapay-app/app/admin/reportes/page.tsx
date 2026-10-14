'use client';

import { fechaCorta } from '@/lib/fechas';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { usePlanEmpresa } from '@/lib/usePlan';
import { fmtUSD } from '@/lib/admin';

interface FilaSemana {
  id: string;
  fecha_inicio: string;
  fecha_pago: string;
  estado: string;
  horas: number;
  bruto: number;
  neto: number;
}

export default function ReportesPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const { tieneHistorialCompleto, tieneExportAutomatica } = usePlanEmpresa();
  const [semanas, setSemanas] = useState<FilaSemana[]>([]);
  const [autoExport, setAutoExport] = useState(false);
  const [mesReporte, setMesReporte] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;

      const { data: semanasPago } = await supabase
        .from('semanas_pago')
        .select('id, fecha_inicio, fecha_pago, estado')
        .eq('empresa_id', usuario.empresa_id)
        .order('fecha_inicio', { ascending: false })
        .limit(tieneHistorialCompleto ? 12 : 1);

      const filas: FilaSemana[] = [];
      for (const s of semanasPago ?? []) {
        const { data: pagos } = await supabase
          .from('pagos_semanales')
          .select('horas_normales, horas_extra, bruto, neto')
          .eq('semana_id', s.id);

        const agregado = (pagos ?? []).reduce(
          (acc, p) => ({
            horas: acc.horas + Number(p.horas_normales) + Number(p.horas_extra),
            bruto: acc.bruto + Number(p.bruto),
            neto: acc.neto + Number(p.neto),
          }),
          { horas: 0, bruto: 0, neto: 0 }
        );

        filas.push({ ...s, ...agregado });
      }
      setSemanas(filas);
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario, tieneHistorialCompleto]);

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-4">Reportes</h1>

      <div className="flex gap-2 mb-4">
        <a
          href={`/api/reportes/financiero?mes=${new Date().toISOString().slice(0, 7)}&formato=xlsx`}
          className="bg-steel text-white text-xs font-bold px-4 py-2.5 rounded-sm"
        >
          Exportar mes actual a Excel
        </a>
        <a
          href="/admin/reportes/confirmar"
          className="bg-primary text-white text-xs font-bold px-4 py-2.5 rounded-sm"
        >
          Confirmar pagos
        </a>
      </div>

      <div className="bg-card border border-line rounded p-4 mb-4">
        <p className="font-bold text-sm text-ink mb-1">Reporte financiero mensual</p>
        <p className="text-xs text-inkSoft mb-3">
          Nómina con desglose de NIB/NHIP, materiales, vehículos y facturación — para tu contador.
        </p>
        <input
          type="month"
          value={mesReporte}
          onChange={(e) => setMesReporte(e.target.value)}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm mb-2"
        />
        <div className="flex gap-2">
          <a
            href={`/api/reportes/financiero?mes=${mesReporte}&formato=xlsx`}
            className="flex-1 text-center border border-line rounded-sm py-2 text-xs font-bold text-ink"
          >
            Descargar Excel (.xlsx)
          </a>
          <a
            href={`/api/reportes/financiero?mes=${mesReporte}&formato=csv`}
            className="text-center border border-line rounded-sm py-2 px-3 text-xs font-bold text-inkSoft"
          >
            CSV
          </a>
          <a
            href={`/api/reportes/financiero?mes=${mesReporte}&formato=pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center bg-primary text-white rounded-sm py-2 text-xs font-bold"
          >
            Ver PDF
          </a>
        </div>
      </div>

      {tieneExportAutomatica ? (
        <div className="bg-card border border-line rounded p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-ink">Exportación automática</p>
            <p className="text-xs text-inkSoft max-w-[220px]">Envía el reporte semanal por correo cada jueves.</p>
          </div>
          <button
            onClick={() => setAutoExport(!autoExport)}
            className={`w-10 h-5.5 rounded-full relative ${autoExport ? 'bg-primary' : 'bg-line'}`}
          >
            <span className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform ${autoExport ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      ) : (
        <div className="bg-card border border-line rounded p-4 mb-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">🔒</div>
          <div className="flex-1">
            <p className="font-bold text-sm text-ink">Exportación automática</p>
            <p className="text-xs text-inkSoft">Disponible desde el plan Profesional.</p>
          </div>
          <a href="/admin/plan" className="bg-primary text-white text-xs font-bold px-3 py-2 rounded-sm">Ver planes</a>
        </div>
      )}

      <div className="bg-card border border-line rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-inkSoft border-b border-line">
              <th className="py-2 pl-3 font-semibold">Semana</th>
              <th className="font-semibold">Horas</th>
              <th className="font-semibold">Bruto</th>
              <th className="font-semibold">Neto</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="py-2.5 pl-3">{fechaCorta(s.fecha_inicio)}</td>
                <td>{s.horas.toFixed(1)}h</td>
                <td>{fmtUSD(s.bruto)}</td>
                <td>{fmtUSD(s.neto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!tieneHistorialCompleto && (
        <div className="bg-card border border-line rounded p-4 mt-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">🔒</div>
          <div className="flex-1">
            <p className="font-bold text-sm text-ink">Historial completo</p>
            <p className="text-xs text-inkSoft">Ve más allá de la semana actual — disponible desde el plan Básico.</p>
          </div>
          <a href="/admin/plan" className="bg-primary text-white text-xs font-bold px-3 py-2 rounded-sm">Ver planes</a>
        </div>
      )}
    </>
  );
}
