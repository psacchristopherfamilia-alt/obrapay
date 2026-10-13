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
  porcentajeSeguro: number;
  prestamoInicial: number;
  metodoPago: MetodoPago;
  cuentaBancaria?: string;
  proyectoIds: string[];
  idioma: 'es' | 'en' | 'ht';
  requiereGps: boolean;
}

export async function crearTrabajador(datos: DatosNuevoTrabajador) {
  // 1. Empresa del admin que está haciendo la petición (viene de su propia sesión)
  const sesion = supabaseServer();
  const { data: { user: adminAuth } } = await sesion.auth.getUser();
  if (!adminAuth) return { error: 'No autenticado' };

  const { data: admin } = await sesion.from('usuarios').select('empresa_id, rol').eq('id', adminAuth.id).single();
  if (!admin || admin.rol !== 'admin') return { error: 'No autorizado' };

  const admin_db = supabaseAdmin();

  // 2. Cuenta de Auth — el trabajador recibe correo para poner su contraseña
  const { data: nuevaCuenta, error: errorAuth } = await admin_db.auth.admin.inviteUserByEmail(datos.email);
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
    porcentaje_seguro: datos.porcentajeSeguro,
    metodo_pago: datos.metodoPago,
    cuenta_bancaria: datos.cuentaBancaria ?? null,
    requiere_gps: datos.requiereGps,
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
