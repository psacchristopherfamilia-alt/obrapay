'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { usePlanEmpresa } from '@/lib/usePlan';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { costoPorProyecto, fmtUSD } from '@/lib/admin';
import {
  obtenerCatalogoMateriales, obtenerEntregasPorProyecto, registrarCompra,
  type MaterialCatalogo, type EntregaProyecto,
} from '@/lib/materiales';
import {
  obtenerDocumentosProyecto, subirDocumento, eliminarDocumento,
  type DocumentoProyecto, type TipoDocumento,
} from '@/lib/documentos';
import {
  obtenerEquiposDisponibles, obtenerAsignacionesAbiertas, entregarEquipo, devolverEquipo,
  type EquipoCatalogo, type AsignacionEquipo, type CondicionEquipo,
} from '@/lib/equipos';
import {
  obtenerVehiculosDisponibles, obtenerAsignacionesAbiertas as obtenerAsignacionesVehiculo,
  asignarVehiculo, devolverVehiculo,
  type VehiculoCatalogo, type AsignacionVehiculo,
} from '@/lib/vehiculos';
import type { Proyecto } from '@/types/database';

interface Supervisor {
  usuario_id: string;
  nombre: string;
}
interface Miembro {
  usuario_id: string;
  nombre: string;
  oficio: string;
  tarifa_hora: number;
}

const ETIQUETA_TIPO_DOC: Record<TipoDocumento, string> = {
  permiso: 'Permiso',
  contrato: 'Contrato',
  seguro: 'Seguro',
  otro: 'Otro',
};

function CandadoPlan({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div className="bg-card border border-line rounded p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">🔒</div>
      <div className="flex-1">
        <p className="font-bold text-sm text-ink">{titulo}</p>
        <p className="text-xs text-inkSoft">{descripcion}</p>
      </div>
      <a href="/admin/plan" className="bg-primary text-white text-xs font-bold px-3 py-2 rounded-sm whitespace-nowrap">
        Ver planes
      </a>
    </div>
  );
}

export default function DetalleProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const { tieneGeofence, tieneMultiSupervisor } = usePlanEmpresa();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [capturandoUbicacion, setCapturandoUbicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);
  const [costoManoObra, setCostoManoObra] = useState(0);
  const [supervisores, setSupervisores] = useState<Supervisor[]>([]);
  const [candidatos, setCandidatos] = useState<Supervisor[]>([]);
  const [equipo, setEquipo] = useState<Miembro[]>([]);

  const [catalogo, setCatalogo] = useState<MaterialCatalogo[]>([]);
  const [entregas, setEntregas] = useState<EntregaProyecto[]>([]);
  const [formCompra, setFormCompra] = useState({ materialId: '', cantidad: '', costo: '', proveedor: '' });
  const [guardandoCompra, setGuardandoCompra] = useState(false);

  const [documentos, setDocumentos] = useState<DocumentoProyecto[]>([]);

  const [equipoDisponible, setEquipoDisponible] = useState<EquipoCatalogo[]>([]);
  const [equipoAsignado, setEquipoAsignado] = useState<AsignacionEquipo[]>([]);
  const [equipoSeleccionado, setEquipoSeleccionado] = useState('');
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [condicionDevolucion, setCondicionDevolucion] = useState<CondicionEquipo>('buena');

  const [vehiculoDisponible, setVehiculoDisponible] = useState<VehiculoCatalogo[]>([]);
  const [vehiculoAsignado, setVehiculoAsignado] = useState<AsignacionVehiculo[]>([]);
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState('');
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>('otro');
  const [vencimientoDoc, setVencimientoDoc] = useState('');
  const [subiendoDoc, setSubiendoDoc] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const { data: p } = await supabase.from('proyectos').select('*').eq('id', id).single();
    if (!p) return;
    setProyecto(p);

    const costos = await costoPorProyecto(supabase, [id], p.empresa_id);
    setCostoManoObra(costos.get(id) ?? 0);

    const { data: principal } = await supabase.from('usuarios').select('id, nombre').eq('id', p.supervisor_principal_id).single();
    const { data: extra } = await supabase
      .from('proyecto_supervisores')
      .select('usuarios(id, nombre)')
      .eq('proyecto_id', id);

    const lista: Supervisor[] = [];
    if (principal) lista.push({ usuario_id: principal.id, nombre: principal.nombre });
    (extra ?? []).forEach((e: any) => lista.push({ usuario_id: e.usuarios.id, nombre: e.usuarios.nombre }));
    setSupervisores(lista);

    const { data: todosSupervisores } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('empresa_id', p.empresa_id)
      .eq('rol', 'supervisor');
    const idsYaAsignados = new Set(lista.map((s) => s.usuario_id));
    setCandidatos(
      (todosSupervisores ?? [])
        .filter((s) => !idsYaAsignados.has(s.id))
        .map((s) => ({ usuario_id: s.id, nombre: s.nombre }))
    );

    const { data: asignados } = await supabase
      .from('proyecto_trabajadores')
      .select('usuarios(id, nombre, perfil_nomina(oficio, tarifa_hora))')
      .eq('proyecto_id', id);
    setEquipo(
      (asignados ?? []).map((a: any) => ({
        usuario_id: a.usuarios.id,
        nombre: a.usuarios.nombre,
        oficio: a.usuarios.perfil_nomina?.oficio ?? '—',
        tarifa_hora: a.usuarios.perfil_nomina?.tarifa_hora ?? 0,
      }))
    );

    setCatalogo(await obtenerCatalogoMateriales(supabase, p.empresa_id));
    setEntregas(await obtenerEntregasPorProyecto(supabase, id));
    setDocumentos(await obtenerDocumentosProyecto(supabase, id));
    setEquipoDisponible(await obtenerEquiposDisponibles(supabase, p.empresa_id));
    setEquipoAsignado(await obtenerAsignacionesAbiertas(supabase, id));
    setVehiculoDisponible(await obtenerVehiculosDisponibles(supabase, p.empresa_id));
    setVehiculoAsignado(await obtenerAsignacionesVehiculo(supabase, id));
  }, [supabase, id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function toggleGeofence() {
    if (!proyecto) return;
    const { error } = await supabase
      .from('proyectos')
      .update({ geo_cerca_activa: !proyecto.geo_cerca_activa })
      .eq('id', proyecto.id);
    if (!error) setProyecto({ ...proyecto, geo_cerca_activa: !proyecto.geo_cerca_activa });
  }

  function capturarUbicacionProyecto() {
    if (!proyecto || !navigator.geolocation) return;
    setCapturandoUbicacion(true);
    setErrorUbicacion(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const { error } = await supabase
          .from('proyectos')
          .update({ geo_cerca_lat: lat, geo_cerca_lng: lng })
          .eq('id', proyecto.id);
        setCapturandoUbicacion(false);
        if (error) {
          setErrorUbicacion(error.message);
          return;
        }
        setProyecto({ ...proyecto, geo_cerca_lat: lat, geo_cerca_lng: lng });
      },
      () => {
        setErrorUbicacion('No se pudo obtener tu ubicación — revisa el permiso del navegador.');
        setCapturandoUbicacion(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function agregarSupervisor(usuarioId: string) {
    if (!usuarioId) return;
    const { error } = await supabase
      .from('proyecto_supervisores')
      .insert({ proyecto_id: id, usuario_id: usuarioId });
    if (error) alert('No se pudo agregar: ' + error.message);
    await cargar();
  }

  async function manejarRegistrarCompra() {
    if (!formCompra.materialId || !formCompra.cantidad || !formCompra.costo || !usuario || !proyecto) return;
    setGuardandoCompra(true);
    // Se registra la compra y, como aquí siempre se sabe el proyecto, se
    // entrega completa a este proyecto en el mismo paso.
    const resultado = await registrarCompra(supabase, {
      empresaId: proyecto.empresa_id,
      materialId: formCompra.materialId,
      cantidad: parseFloat(formCompra.cantidad),
      costoTotal: parseFloat(formCompra.costo),
      proveedor: formCompra.proveedor || undefined,
      compradoPor: usuario.id,
      proyectoId: id,
    });
    setGuardandoCompra(false);
    if (resultado.error) {
      alert('No se pudo registrar: ' + resultado.error);
      return;
    }
    setFormCompra({ materialId: '', cantidad: '', costo: '', proveedor: '' });
    await cargar();
  }

  async function subirArchivo() {
    const archivo = inputArchivoRef.current?.files?.[0];
    if (!archivo || !usuario) return;
    setSubiendoDoc(true);
    const resultado = await subirDocumento(supabase, id, archivo, tipoDoc, vencimientoDoc || null, usuario.id);
    setSubiendoDoc(false);
    if (resultado.error) {
      alert('No se pudo subir: ' + resultado.error);
      return;
    }
    setVencimientoDoc('');
    if (inputArchivoRef.current) inputArchivoRef.current.value = '';
    await cargar();
  }

  async function manejarAsignarEquipo() {
    if (!equipoSeleccionado || !usuario) return;
    const resultado = await entregarEquipo(supabase, {
      equipoId: equipoSeleccionado,
      proyectoId: id,
      condicion: 'buena',
      entregadoPor: usuario.id,
    });
    if (resultado.error) {
      alert('No se pudo asignar: ' + resultado.error);
      return;
    }
    setEquipoSeleccionado('');
    await cargar();
  }

  async function manejarDevolverEquipo(a: AsignacionEquipo) {
    if (!usuario) return;
    const resultado = await devolverEquipo(supabase, {
      asignacionId: a.id,
      equipoId: a.equipo_id,
      condicion: condicionDevolucion,
      recibidoPor: usuario.id,
    });
    if (resultado.error) {
      alert('No se pudo registrar la devolución: ' + resultado.error);
      return;
    }
    setDevolviendo(null);
    setCondicionDevolucion('buena');
    await cargar();
  }

  async function manejarAsignarVehiculo() {
    if (!vehiculoSeleccionado || !usuario) return;
    const resultado = await asignarVehiculo(supabase, {
      vehiculoId: vehiculoSeleccionado,
      proyectoId: id,
      entregadoPor: usuario.id,
    });
    if (resultado.error) {
      alert('No se pudo asignar: ' + resultado.error);
      return;
    }
    setVehiculoSeleccionado('');
    await cargar();
  }

  async function manejarDevolverVehiculo(a: AsignacionVehiculo) {
    if (!usuario) return;
    const resultado = await devolverVehiculo(supabase, a.id, usuario.id);
    if (resultado.error) {
      alert('No se pudo registrar la devolución: ' + resultado.error);
      return;
    }
    await cargar();
  }

  async function borrarDocumento(d: DocumentoProyecto) {
    if (!confirm(`¿Eliminar "${d.nombre}"?`)) return;
    const resultado = await eliminarDocumento(supabase, d.id, d.storage_path);
    if (resultado.error) alert('No se pudo eliminar: ' + resultado.error);
    await cargar();
  }

  if (!proyecto) return <p className="text-sm text-inkSoft">Cargando…</p>;

  const totalMateriales = entregas.reduce((sum, e) => sum + e.costo_asignado, 0);
  const costoTotal = costoManoObra + totalMateriales;
  const pct = proyecto.presupuesto ? Math.min(100, (costoTotal / proyecto.presupuesto) * 100) : 0;

  return (
    <>
      <a href="/admin/proyectos" className="text-xs text-inkSoft">← Volver</a>
      <h1 className="font-heading font-extrabold text-2xl text-ink mt-2">{proyecto.nombre}</h1>

      <div className="grid grid-cols-2 gap-3 my-4">
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-xl text-ink">{fmtUSD(costoManoObra)}</p>
          <p className="text-[11px] text-inkSoft">Mano de obra</p>
        </div>
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-xl text-ink">{fmtUSD(totalMateriales)}</p>
          <p className="text-[11px] text-inkSoft">Materiales</p>
        </div>
      </div>

      <div className="bg-card border border-line rounded p-4 mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-inkSoft">Presupuesto usado (mano de obra + materiales)</span>
          <span className="text-inkSoft">
            {fmtUSD(costoTotal)} / {proyecto.presupuesto ? fmtUSD(proyecto.presupuesto) : '—'}
          </span>
        </div>
        <div className="bg-line h-1.5 rounded-full">
          <div className={`h-1.5 rounded-full ${pct >= 80 ? 'bg-danger' : 'bg-steel'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Geo-cerca — candado Profesional+ */}
      {tieneGeofence ? (
        <div className="bg-card border border-line rounded p-4 mb-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-ink">Geo-cerca anti-fraude</p>
            <p className="text-xs text-inkSoft max-w-[220px]">
              Exige marcar dentro de {proyecto.geo_cerca_radio_m}m del proyecto.
            </p>
          </div>
          <button
            onClick={toggleGeofence}
            className={`w-10 h-5.5 rounded-full relative transition-colors ${
              proyecto.geo_cerca_activa ? 'bg-primary' : 'bg-line'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform ${
                proyecto.geo_cerca_activa ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      ) : null}
      {tieneGeofence && proyecto.geo_cerca_activa && (
        <div className="bg-card border border-line rounded p-4 mb-3">
          {proyecto.geo_cerca_lat && proyecto.geo_cerca_lng ? (
            <p className="text-xs text-ink mb-2">
              Centro guardado ({proyecto.geo_cerca_lat.toFixed(5)}, {proyecto.geo_cerca_lng.toFixed(5)})
            </p>
          ) : (
            <p className="text-xs text-warning mb-2">
              Sin ubicación guardada todavía — la geo-cerca está activa pero no valida nada hasta que la fijes.
            </p>
          )}
          <button
            onClick={capturarUbicacionProyecto}
            disabled={capturandoUbicacion}
            className="w-full border border-primary text-primary rounded-sm py-2 text-xs font-bold disabled:opacity-60"
          >
            {capturandoUbicacion ? 'Obteniendo ubicación…' : proyecto.geo_cerca_lat ? 'Actualizar ubicación (párate en la obra)' : 'Usar mi ubicación actual'}
          </button>
          {errorUbicacion && <p className="text-danger text-xs mt-1">{errorUbicacion}</p>}
        </div>
      )}
      {!tieneGeofence && (
        <div className="mb-3">
          <CandadoPlan
            titulo="Geo-cerca anti-fraude"
            descripcion="Bloquea el marcaje fuera del sitio de trabajo — disponible desde el plan Profesional."
          />
        </div>
      )}

      {/* Multi-supervisor — candado Profesional+ */}
      {tieneMultiSupervisor ? (
        <div className="bg-card border border-line rounded p-4 mb-4">
          <p className="text-xs font-bold text-ink mb-2">Supervisor</p>
          {supervisores.map((s) => (
            <p key={s.usuario_id} className="text-sm text-ink py-1.5 border-b border-line last:border-0">
              {s.nombre}
            </p>
          ))}
          {candidatos.length > 0 && (
            <select
              onChange={(e) => agregarSupervisor(e.target.value)}
              defaultValue=""
              className="mt-2 w-full border border-line rounded-sm text-sm px-2 py-2"
            >
              <option value="" disabled>+ Agregar supervisor</option>
              {candidatos.map((c) => (
                <option key={c.usuario_id} value={c.usuario_id}>{c.nombre}</option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div className="mb-4">
          <CandadoPlan
            titulo="+ Agregar supervisor"
            descripcion="Asignar más de un supervisor por proyecto — disponible desde el plan Profesional."
          />
        </div>
      )}

      <h2 className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-2">
        Trabajadores
      </h2>
      <div className="bg-card border border-line rounded divide-y divide-line mb-4">
        {equipo.map((m) => (
          <div key={m.usuario_id} className="flex justify-between px-4 py-3">
            <div>
              <p className="font-semibold text-sm text-ink">{m.nombre}</p>
              <p className="text-xs text-inkSoft">{m.oficio}</p>
            </div>
            <span className="text-xs text-inkSoft">${m.tarifa_hora.toFixed(2)}/h</span>
          </div>
        ))}
        {equipo.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">—</p>}
      </div>

      <h2 className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-2">
        Materiales
      </h2>
      <div className="bg-card border border-line rounded p-3 mb-3 space-y-2">
        <select
          value={formCompra.materialId}
          onChange={(e) => setFormCompra({ ...formCompra, materialId: e.target.value })}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
        >
          <option value="">Selecciona un material…</option>
          {catalogo.filter((m) => m.activo).map((m) => (
            <option key={m.id} value={m.id}>{m.nombre} (por {m.unidad})</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="number"
            value={formCompra.cantidad}
            onChange={(e) => setFormCompra({ ...formCompra, cantidad: e.target.value })}
            placeholder="Cantidad"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={formCompra.costo}
            onChange={(e) => setFormCompra({ ...formCompra, costo: e.target.value })}
            placeholder="Costo total $"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <input
          value={formCompra.proveedor}
          onChange={(e) => setFormCompra({ ...formCompra, proveedor: e.target.value })}
          placeholder="Proveedor (opcional)"
          className="w-full border border-line rounded-sm px-3 py-2 text-sm"
        />
        {catalogo.length === 0 && (
          <p className="text-[11px] text-inkSoft">
            Todavía no tienes materiales en tu catálogo — agrégalos desde la pestaña "Materiales".
          </p>
        )}
        <button
          onClick={manejarRegistrarCompra}
          disabled={guardandoCompra}
          className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
        >
          {guardandoCompra ? 'Registrando…' : '+ Registrar compra'}
        </button>
      </div>
      <div className="bg-card border border-line rounded divide-y divide-line mb-4">
        {entregas.map((e) => (
          <div key={e.id} className="flex justify-between px-4 py-3">
            <div>
              <p className="font-semibold text-sm text-ink">{e.material_nombre}</p>
              <p className="text-xs text-inkSoft">{e.cantidad} {e.unidad}</p>
            </div>
            <span className="text-sm font-semibold text-ink">{fmtUSD(e.costo_asignado)}</span>
          </div>
        ))}
        {entregas.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">Sin materiales entregados todavía.</p>}
      </div>

      <p className="text-[11px] text-inkSoft -mt-2 mb-4">
        ¿Ya compraste este material para otro proyecto y solo falta traerlo aquí?{' '}
        <a href="/comprador/compras" className="text-primary font-semibold">Repártelo desde Compras</a> en vez de comprarlo de nuevo.
      </p>

      <h2 className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-2">
        Equipo
      </h2>
      <div className="bg-card border border-line rounded p-3 mb-3 space-y-2">
        <select
          value={equipoSeleccionado}
          onChange={(e) => setEquipoSeleccionado(e.target.value)}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
        >
          <option value="">Selecciona un equipo disponible…</option>
          {equipoDisponible.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
        {equipoDisponible.length === 0 && (
          <p className="text-[11px] text-inkSoft">No hay equipo disponible — todo está asignado o de baja.</p>
        )}
        <button
          onClick={manejarAsignarEquipo}
          disabled={!equipoSeleccionado}
          className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
        >
          + Asignar a este proyecto
        </button>
      </div>
      <div className="bg-card border border-line rounded divide-y divide-line mb-4">
        {equipoAsignado.map((a) => (
          <div key={a.id} className="px-4 py-3">
            <div className="flex justify-between items-center">
              <p className="font-semibold text-sm text-ink">{a.equipo_nombre}</p>
              {devolviendo !== a.id && (
                <button onClick={() => setDevolviendo(a.id)} className="text-[11px] font-bold text-primary">
                  Registrar devolución
                </button>
              )}
            </div>
            {devolviendo === a.id && (
              <div className="mt-2 space-y-2">
                <select
                  value={condicionDevolucion}
                  onChange={(e) => setCondicionDevolucion(e.target.value as CondicionEquipo)}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
                >
                  <option value="buena">Buena condición</option>
                  <option value="regular">Condición regular</option>
                  <option value="dañada">Dañada</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDevolviendo(null)}
                    className="flex-1 border border-line rounded-sm py-2 text-xs font-bold text-ink"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => manejarDevolverEquipo(a)}
                    className="flex-1 bg-primary text-white rounded-sm py-2 text-xs font-bold"
                  >
                    Confirmar devolución
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {equipoAsignado.length === 0 && (
          <p className="px-4 py-4 text-sm text-inkSoft">Sin equipo asignado a este proyecto.</p>
        )}
      </div>

      <h2 className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-2">
        Vehículos
      </h2>
      <div className="bg-card border border-line rounded p-3 mb-3 space-y-2">
        <select
          value={vehiculoSeleccionado}
          onChange={(e) => setVehiculoSeleccionado(e.target.value)}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
        >
          <option value="">Selecciona un vehículo disponible…</option>
          {vehiculoDisponible.map((v) => (
            <option key={v.id} value={v.id}>{v.nombre}</option>
          ))}
        </select>
        {vehiculoDisponible.length === 0 && (
          <p className="text-[11px] text-inkSoft">No hay vehículos disponibles — todos están asignados o de baja.</p>
        )}
        <button
          onClick={manejarAsignarVehiculo}
          disabled={!vehiculoSeleccionado}
          className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
        >
          + Asignar a este proyecto
        </button>
      </div>
      <div className="bg-card border border-line rounded divide-y divide-line mb-4">
        {vehiculoAsignado.map((a) => (
          <div key={a.id} className="flex justify-between items-center px-4 py-3">
            <p className="font-semibold text-sm text-ink">{a.vehiculo_nombre}</p>
            <button onClick={() => manejarDevolverVehiculo(a)} className="text-[11px] font-bold text-primary">
              Registrar devolución
            </button>
          </div>
        ))}
        {vehiculoAsignado.length === 0 && (
          <p className="px-4 py-4 text-sm text-inkSoft">Sin vehículo asignado a este proyecto.</p>
        )}
      </div>

      <h2 className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-2">
        Documentos
      </h2>
      <div className="bg-card border border-line rounded p-3 mb-3 space-y-2">
        <input
          ref={inputArchivoRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic"
          className="w-full text-sm"
        />
        <div className="flex gap-2">
          <select
            value={tipoDoc}
            onChange={(e) => setTipoDoc(e.target.value as TipoDocumento)}
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm bg-white"
          >
            {(Object.keys(ETIQUETA_TIPO_DOC) as TipoDocumento[]).map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO_DOC[t]}</option>
            ))}
          </select>
          <input
            type="date"
            value={vencimientoDoc}
            onChange={(e) => setVencimientoDoc(e.target.value)}
            title="Fecha de vencimiento (opcional)"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={subirArchivo}
          disabled={subiendoDoc}
          className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
        >
          {subiendoDoc ? 'Subiendo…' : '+ Subir documento'}
        </button>
      </div>
      <div className="bg-card border border-line rounded divide-y divide-line">
        {documentos.map((d) => (
          <div key={d.id} className="flex justify-between items-center px-4 py-3">
            <div>
              <a href={d.url ?? '#'} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm text-primary">
                {d.nombre}
              </a>
              <p className="text-xs text-inkSoft">
                {ETIQUETA_TIPO_DOC[d.tipo]}
                {d.fecha_vencimiento ? ` · vence ${new Date(d.fecha_vencimiento).toLocaleDateString('es-DO')}` : ''}
              </p>
            </div>
            <button onClick={() => borrarDocumento(d)} className="text-[11px] font-bold text-danger">
              Eliminar
            </button>
          </div>
        ))}
        {documentos.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">Sin documentos todavía.</p>}
      </div>
    </>
  );
}
