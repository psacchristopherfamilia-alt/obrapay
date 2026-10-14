'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import type { RolUsuario, MetodoPago } from '@/types/database';

interface DatosNuevoTrabajador {
  nombre: string;
  email: string;
  telefono?: string;
  sysRole: RolUsuario;
  oficio: string;
  tarifaHora: number;
  prestamoInicial: number;
  metodoPago: MetodoPago;
  cuentaBancaria?: string;
  proyectoIds: string[];
  idioma: 'es' | 'en' | 'ht';
  requiereGps: boolean;
  requierePermisoTrabajo?: boolean;
  permisoTrabajoNumero?: string;
  permisoTrabajoVencimiento?: string;
}

export async function crearTrabajador(datos: DatosNuevoTrabajador) {
  if (datos.sysRole === 'admin') {
    // Solo el Creador SaaS asigna administradores (vía crearEmpresa, al
    // dar de alta una empresa nueva). Un Admin no puede crear otro Admin
    // para su propia empresa — es un límite de negocio, no un descuido:
    // mantiene una sola persona responsable por empresa frente a la
    // plataforma, salvo que el Creador SaaS decida lo contrario.
    return { error: 'Solo el Creador SaaS puede asignar el rol de Admin' };
  }

  // 1. Empresa del admin que está haciendo la petición (viene de su propia sesión)
  const sesion = supabaseServer();
  const { data: { user: adminAuth } } = await sesion.auth.getUser();
  if (!adminAuth) return { error: 'No autenticado' };

  const { data: admin } = await sesion.from('usuarios').select('empresa_id, rol').eq('id', adminAuth.id).single();
  if (!admin || admin.rol !== 'admin') return { error: 'No autorizado' };

  const admin_db = supabaseAdmin();

  // 2. Cuenta de Auth — el trabajador recibe correo para poner su contraseña
  const { data: nuevaCuenta, error: errorAuth } = await admin_db.auth.admin.inviteUserByEmail(datos.email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/nueva-clave` });
  if (errorAuth || !nuevaCuenta.user) {
    return { error: errorAuth?.message ?? 'No se pudo crear la cuenta' };
  }
  const usuarioId = nuevaCuenta.user.id;

  // 3. Fila en usuarios
  const { error: errorUsuario } = await admin_db.from('usuarios').insert({
    id: usuarioId,
    empresa_id: admin.empresa_id,
    nombre: datos.nombre,
    email: datos.email,
    telefono: datos.telefono ?? null,
    rol: datos.sysRole,
    idioma_preferido: datos.idioma,
    estado: 'activo',
  });
  if (errorUsuario) return { error: errorUsuario.message };

  // 4. Perfil de nómina
  const { error: errorPerfil } = await admin_db.from('perfil_nomina').insert({
    usuario_id: usuarioId,
    oficio: datos.oficio,
    tarifa_hora: datos.tarifaHora,
    metodo_pago: datos.metodoPago,
    cuenta_bancaria: datos.cuentaBancaria ?? null,
    requiere_gps: datos.requiereGps,
    requiere_permiso_trabajo: datos.requierePermisoTrabajo ?? false,
    permiso_trabajo_numero: datos.permisoTrabajoNumero || null,
    permiso_trabajo_vencimiento: datos.permisoTrabajoVencimiento || null,
  });
  if (errorPerfil) return { error: errorPerfil.message };

  // 5. Préstamo inicial, si se indicó uno
  if (datos.prestamoInicial > 0) {
    await admin_db.from('prestamos').insert({
      usuario_id: usuarioId,
      monto_total: datos.prestamoInicial,
      saldo_pendiente: datos.prestamoInicial,
    });
  }

  // 6. Asignación a proyectos
  if (datos.proyectoIds.length > 0) {
    await admin_db.from('proyecto_trabajadores').insert(
      datos.proyectoIds.map((proyecto_id) => ({ proyecto_id, usuario_id: usuarioId }))
    );
  }

  return { ok: true, usuarioId };
}

export interface FilaImportacion {
  nombre: string;
  email: string;
  telefono?: string;
  oficio: string;
  tarifaHora: number;
  idioma?: string;
}

/**
 * Importa trabajadores en bloque (CSV pegado o subido en la pantalla
 * Importar). Reutiliza crearTrabajador fila por fila para que cada uno
 * pase por las mismas validaciones y reciba su correo de invitación.
 * Devuelve el resultado de cada fila: una fila con error no detiene las demás.
 */
export async function importarTrabajadores(filas: FilaImportacion[]) {
  if (!Array.isArray(filas) || filas.length === 0) return { error: 'No hay filas para importar.' };
  if (filas.length > 200) return { error: 'Máximo 200 trabajadores por importación.' };

  const resultados: Array<{ email: string; ok: boolean; error?: string }> = [];
  for (const f of filas) {
    const email = (f.email ?? '').trim().toLowerCase();
    if (!f.nombre?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      resultados.push({ email: email || '(sin correo)', ok: false, error: 'Nombre o correo inválido' });
      continue;
    }
    if (!(f.tarifaHora > 0)) {
      resultados.push({ email, ok: false, error: 'Tarifa por hora inválida' });
      continue;
    }
    const idioma = f.idioma === 'en' || f.idioma === 'ht' ? f.idioma : 'es';
    const r: any = await crearTrabajador({
      nombre: f.nombre.trim(),
      email,
      telefono: f.telefono?.trim() || undefined,
      sysRole: 'trabajador',
      oficio: f.oficio?.trim() || 'Obrero',
      tarifaHora: f.tarifaHora,
      prestamoInicial: 0,
      metodoPago: 'transfer',
      proyectoIds: [],
      idioma,
      requiereGps: false,
    });
    resultados.push(r?.error ? { email, ok: false, error: r.error } : { email, ok: true });
  }
  return { resultados };
}
