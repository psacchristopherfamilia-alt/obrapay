'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { usePlanEmpresa } from '@/lib/usePlan';
import { obtenerSemanaAbierta, costoPorProyecto, fmtUSD } from '@/lib/admin';
import type { Proyecto } from '@/types/database';

interface ProyectoConCosto extends Proyecto {
  costo: number;
}

export default function AdminPanelPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const { tieneAlertasPresupuesto } = usePlanEmpresa();
  const [proyectos, setProyectos] = useState<ProyectoConCosto[]>([]);
  const [trabajadoresActivos, setTrabajadoresActivos] = useState(0);
  const [pendientes, setPendientes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;

      const { data: proys } = await supabase
        .from('proyectos')
        .select('*')
        .eq('empresa_id', usuario.empresa_id)
        .eq('estado', 'activo');

      const ids = (proys ?? []).map((p) => p.id);
      const costos = ids.length ? await costoPorProyecto(supabase, ids, usuario.empresa_id) : new Map();

      setProyectos((proys ?? []).map((p) => ({ ...p, costo: costos.get(p.id) ?? 0 })));

      const [{ count: activos }, { count: porAprobar }] = await Promise.all([
        supabase
          .from('registros_horas')
          .select('id', { count: 'exact', head: true })
          .in('proyecto_id', ids)
          .is('hora_salida', null),
        supabase
          .from('registros_horas')
          .select('id', { count: 'exact', head: true })
          .in('proyecto_id', ids)
          .in('estado', ['pendiente', 'cerrado_automatico']),
      ]);

      setTrabajadoresActivos(activos ?? 0);
      setPendientes(porAprobar ?? 0);
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  async function cerrarSemana() {
    if (!confirm('¿Cerrar la semana actual y generar los pagos en borrador?')) return;
    setCerrando(true);
    const res = await fetch('/api/cerrar-semana', { method: 'POST' });
    const data = await res.json();
    setCerrando(false);

    if (data.error) {
      alert(data.error);
      return;
    }
    alert('Semana cerrada. Ve a Reportes → Confirmar pagos para revisar los descuentos de préstamo.');
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  const totalCosto = proyectos.reduce((s, p) => s + p.costo, 0);
  const sobrePresupuesto = proyectos.filter(
    (p) => p.presupuesto && p.costo / p.presupuesto >= 0.8
  );

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-1">Panel</h1>
      <p className="text-sm text-inkSoft mb-5">Semana en curso</p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-2xl text-ink">{fmtUSD(totalCosto)}</p>
          <p className="text-[11px] text-inkSoft">Costo mano de obra</p>
        </div>
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-2xl text-ink">{trabajadoresActivos}</p>
          <p className="text-[11px] text-inkSoft">Trabajadores activos</p>
        </div>
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-2xl text-ink">{pendientes}</p>
          <p className="text-[11px] text-inkSoft">Horas por aprobar</p>
        </div>
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-2xl text-ink">Mié</p>
          <p className="text-[11px] text-inkSoft">Próximo cierre</p>
        </div>
      </div>

      {/* Alerta de sobrepresupuesto — función real del plan Profesional+ */}
      {tieneAlertasPresupuesto &&
        sobrePresupuesto.map((p) => (
          <div key={p.id} className="bg-card border-l-4 border-danger rounded p-3 mb-3 flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="font-bold text-sm text-ink">Alerta de sobrepresupuesto</p>
              <p className="text-xs text-inkSoft">
                {p.nombre} va en {Math.round((p.costo / (p.presupuesto ?? 1)) * 100)}% de su
                presupuesto de mano de obra.
              </p>
            </div>
            <a href={`/admin/proyectos/${p.id}`} className="text-xs font-bold text-primary whitespace-nowrap">
              Ver proyecto
            </a>
          </div>
        ))}

      <h2 className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mt-6 mb-2">
        Costo por proyecto
      </h2>
      <div className="bg-card border border-line rounded p-4 space-y-3">
        {proyectos.map((p) => (
          <div key={p.id}>
            <div className="flex justify-between text-xs mb-1">
              <span>{p.nombre}</span>
              <span className="font-semibold">{fmtUSD(p.costo)}</span>
            </div>
            <div className="bg-line h-1.5 rounded-full">
              <div
                className="bg-steel h-1.5 rounded-full"
                style={{ width: `${Math.min(100, (p.costo / (p.presupuesto ?? p.costo || 1)) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={cerrarSemana}
        disabled={cerrando}
        className="bg-primary text-white text-sm font-bold px-5 py-3 rounded-sm mt-4 disabled:opacity-60"
      >
        {cerrando ? 'Cerrando…' : 'Cerrar semana y generar reporte'}
      </button>
    </>
  );
}
