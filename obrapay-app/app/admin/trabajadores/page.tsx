'use client';

import { useCallback, useEffect, useState } from 'react';
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

const ETIQUETA_ROL: Record<string, string> = {
  supervisor: 'Supervisor',
  comprador: 'Comprador',
};

// Tamaño de página. La búsqueda, el filtro y la paginación se resuelven
// en la base de datos (no en el navegador sobre todas las filas), así que
// la pantalla carga igual de rápido con 20 trabajadores que con 2,000.
const POR_PAGINA = 25;

export default function TrabajadoresPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [filas, setFilas] = useState<FilaTrabajador[]>([]);
  const [total, setTotal] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [filtroPago, setFiltroPago] = useState<MetodoPago | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);

  // Espera 300ms después de la última tecla antes de consultar — sin
  // esto, cada letra escrita dispararía una consulta a la base de datos.
  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargarPagina = useCallback(
    async (desde: number) => {
      if (!usuario?.empresa_id) return { filas: [] as FilaTrabajador[], total: 0 };

      // Con filtro de método de pago hace falta !inner para que el filtro
      // sobre la tabla anidada excluya a los que no coinciden (sin !inner,
      // PostgREST devolvería al usuario con perfil_nomina vacío).
      const relacionPerfil = filtroPago === 'all' ? 'perfil_nomina' : 'perfil_nomina!inner';

      let consulta = supabase
        .from('usuarios')
        .select(
          `id, nombre, rol, ${relacionPerfil}(oficio, tarifa_hora, metodo_pago), prestamos(saldo_pendiente, estado)`,
          { count: 'exact' }
        )
        .eq('empresa_id', usuario.empresa_id)
        .in('rol', ['trabajador', 'supervisor', 'comprador'])
        .order('nombre')
        .range(desde, desde + POR_PAGINA - 1);

      if (busquedaAplicada) consulta = consulta.ilike('nombre', `%${busquedaAplicada}%`);
      if (filtroPago !== 'all') consulta = consulta.eq('perfil_nomina.metodo_pago', filtroPago);

      const { data, count } = await consulta;

      return {
        total: count ?? 0,
        filas: (data ?? []).map((u: any) => ({
          id: u.id,
          nombre: u.nombre,
          rol: u.rol,
          oficio: u.perfil_nomina?.oficio ?? '—',
          tarifa_hora: u.perfil_nomina?.tarifa_hora ?? 0,
          metodo_pago: u.perfil_nomina?.metodo_pago ?? 'transfer',
          saldo_prestamo: (u.prestamos ?? []).find((p: any) => p.estado === 'activo')?.saldo_pendiente ?? 0,
        })),
      };
    },
    [supabase, usuario, busquedaAplicada, filtroPago]
  );

  // Cualquier cambio de búsqueda o filtro reinicia desde la página 1.
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    cargarPagina(0).then((r) => {
      if (cancelado) return;
      setFilas(r.filas);
      setTotal(r.total);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [cargarPagina]);

  async function cargarMas() {
    setCargandoMas(true);
    const r = await cargarPagina(filas.length);
    setFilas((prev) => [...prev, ...r.filas]);
    setTotal(r.total);
    setCargandoMas(false);
  }

  return (
    <>
      <div className="flex gap-2 mb-4">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre..."
          className="flex-1 border border-line rounded-sm px-3 py-2.5 text-sm"
        />
        <Link
          href="/admin/trabajadores/importar"
          className="border border-line text-ink text-xs font-bold px-3 py-2.5 rounded-sm whitespace-nowrap"
        >
          Importar
        </Link>
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

      {loading ? (
        <p className="text-sm text-inkSoft">Cargando…</p>
      ) : (
        <>
          <p className="text-[11px] text-inkSoft mb-2">
            Mostrando {filas.length} de {total}
          </p>
          <div className="bg-card border border-line rounded divide-y divide-line">
            {filas.map((f) => (
              <Link key={f.id} href={`/admin/trabajadores/${f.id}`} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 text-primary flex items-center justify-center text-xs font-bold">
                    {f.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-ink">{f.nombre}</p>
                    <p className="text-xs text-inkSoft">
                      {f.oficio} · ${f.tarifa_hora.toFixed(2)}/h {ETIQUETA_ROL[f.rol] ? `· ${ETIQUETA_ROL[f.rol]}` : ''}
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
            {filas.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">Sin resultados.</p>}
          </div>

          {filas.length < total && (
            <button
              onClick={cargarMas}
              disabled={cargandoMas}
              className="w-full mt-3 border border-line rounded-sm py-2.5 text-xs font-bold text-ink disabled:opacity-60"
            >
              {cargandoMas ? 'Cargando…' : `Cargar más (${total - filas.length} restantes)`}
            </button>
          )}
        </>
      )}
    </>
  );
}
