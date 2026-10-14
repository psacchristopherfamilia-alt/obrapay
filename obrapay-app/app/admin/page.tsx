'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { usePlanEmpresa } from '@/lib/usePlan';
import { obtenerSemanaAbierta, costoPorProyecto, fmtUSD } from '@/lib/admin';
import { totalMaterialesPorProyecto } from '@/lib/materiales';
import { obtenerEquiposDanadosOPerdidos, type EquipoCatalogo } from '@/lib/equipos';
import { obtenerVehiculosMantenimientoProximo, type VehiculoCatalogo } from '@/lib/vehiculos';
import { obtenerCertificacionesPorVencer, type CertificacionPorVencer } from '@/lib/certificaciones';
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
  const [equipoAfectado, setEquipoAfectado] = useState<EquipoCatalogo[]>([]);
  const [vehiculosMantenimiento, setVehiculosMantenimiento] = useState<VehiculoCatalogo[]>([]);
  const [certificacionesPorVencer, setCertificacionesPorVencer] = useState<CertificacionPorVencer[]>([]);
  const [permisosPorVencer, setPermisosPorVencer] = useState<{ usuario_id: string; nombre: string; vencimiento: string }[]>([]);
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
      const [costos, materiales] = await Promise.all([
        ids.length ? costoPorProyecto(supabase, ids, usuario.empresa_id) : new Map(),
        totalMaterialesPorProyecto(supabase, ids),
      ]);

      setProyectos(
        (proys ?? []).map((p) => ({
          ...p,
          costo: (costos.get(p.id) ?? 0) + (materiales.get(p.id) ?? 0),
        }))
      );

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
      setEquipoAfectado(await obtenerEquiposDanadosOPerdidos(supabase, usuario.empresa_id));
      setVehiculosMantenimiento(await obtenerVehiculosMantenimientoProximo(supabase, usuario.empresa_id));
      setCertificacionesPorVencer(await obtenerCertificacionesPorVencer(supabase, usuario.empresa_id));

      const limitePermiso = new Date();
      limitePermiso.setMonth(limitePermiso.getMonth() + 3);
      const { data: permisos } = await supabase
        .from('perfil_nomina')
        .select('usuario_id, permiso_trabajo_vencimiento, usuarios!inner(nombre, empresa_id)')
        .eq('requiere_permiso_trabajo', true)
        .eq('usuarios.empresa_id', usuario.empresa_id)
        .not('permiso_trabajo_vencimiento', 'is', null)
        .lte('permiso_trabajo_vencimiento', limitePermiso.toISOString().slice(0, 10));
      setPermisosPorVencer(
        (permisos ?? []).map((p: any) => ({
          usuario_id: p.usuario_id,
          nombre: p.usuarios?.nombre ?? '—',
          vencimiento: p.permiso_trabajo_vencimiento,
        }))
      );
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
          <p className="text-[11px] text-inkSoft">Costo total (obra + materiales)</p>
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
                presupuesto (mano de obra + materiales).
              </p>
            </div>
            <a href={`/admin/proyectos/${p.id}`} className="text-xs font-bold text-primary whitespace-nowrap">
              Ver proyecto
            </a>
          </div>
        ))}

      {/* Equipo dañado o perdido — aviso visual, además del real por WhatsApp/correo */}
      {equipoAfectado.map((e) => (
        <div key={e.id} className="bg-card border-l-4 border-danger rounded p-3 mb-3 flex items-center gap-3">
          <span className="text-xl">🔧</span>
          <div className="flex-1">
            <p className="font-bold text-sm text-ink">Equipo {e.estado === 'perdido' ? 'perdido' : 'dañado'}</p>
            <p className="text-xs text-inkSoft">{e.nombre}</p>
          </div>
          <a href="/admin/equipos" className="text-xs font-bold text-primary whitespace-nowrap">
            Ver equipo
          </a>
        </div>
      ))}

      {/* Mantenimiento de vehículos vencido o a 3 días o menos */}
      {vehiculosMantenimiento.map((v) => {
        const vencido = new Date(v.proximo_mantenimiento!) <= new Date();
        return (
          <div key={v.id} className="bg-card border-l-4 border-warning rounded p-3 mb-3 flex items-center gap-3">
            <span className="text-xl">🚚</span>
            <div className="flex-1">
              <p className="font-bold text-sm text-ink">
                Mantenimiento {vencido ? 'vencido' : 'próximo'}
              </p>
              <p className="text-xs text-inkSoft">
                {v.nombre} — {new Date(v.proximo_mantenimiento!).toLocaleDateString('es-DO')}
              </p>
            </div>
            <a href="/admin/vehiculos" className="text-xs font-bold text-primary whitespace-nowrap">
              Ver vehículos
            </a>
          </div>
        );
      })}

      {/* Certificaciones a 15 días o menos de vencer (o ya vencidas) */}
      {certificacionesPorVencer.map((c) => {
        const vencida = new Date(c.fecha_vencimiento!) <= new Date();
        return (
          <div key={c.id} className="bg-card border-l-4 border-warning rounded p-3 mb-3 flex items-center gap-3">
            <span className="text-xl">📋</span>
            <div className="flex-1">
              <p className="font-bold text-sm text-ink">
                Certificación {vencida ? 'vencida' : 'por vencer'}
              </p>
              <p className="text-xs text-inkSoft">
                {c.nombre} — {c.trabajador_nombre} — {new Date(c.fecha_vencimiento!).toLocaleDateString('es-DO')}
              </p>
            </div>
          </div>
        );
      })}

      {/* Permisos de trabajo a 3 meses o menos de vencer (o ya vencidos) */}
      {permisosPorVencer.map((p) => {
        const vencido = new Date(p.vencimiento) <= new Date();
        return (
          <a
            key={p.usuario_id}
            href={`/admin/trabajadores/${p.usuario_id}`}
            className="block bg-card border-l-4 border-danger rounded p-3 mb-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🛂</span>
              <div className="flex-1">
                <p className="font-bold text-sm text-ink">
                  Permiso de trabajo {vencido ? 'vencido' : 'por vencer'}
                </p>
                <p className="text-xs text-inkSoft">
                  {p.nombre} — {new Date(p.vencimiento).toLocaleDateString('es-DO')}
                </p>
              </div>
            </div>
          </a>
        );
      })}

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
                style={{ width: `${Math.min(100, (p.costo / (p.presupuesto ?? (p.costo || 1))) * 100)}%` }}
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
