'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';

interface DatosRegistroPublico {
  nombreEmpresa: string;
  nombreAdmin: string;
  emailAdmin: string;
  telefonoAdmin?: string;
  idioma: 'es' | 'en' | 'ht';
}

/**
 * A diferencia de crearEmpresa() (app/owner/actions.ts), esta acción la
 * llama alguien SIN sesión — un prospecto desconocido llenando el
 * formulario público de /registro. Por eso:
 * - No valida rol 'owner' — no hay ningún usuario autenticado que validar.
 * - Pide menos datos (menos fricción = más gente que termina de registrarse).
 * - Siempre arranca en el mismo lugar: 30 días de prueba del plan
 *   Profesional, igual que si el Creador SaaS la hubiera dado de alta a
 *   mano — nadie que se registra solo puede elegir otra cosa.
 *
 * LIMITACIÓN CONOCIDA, documentada a propósito: este endpoint no tiene
 * CAPTCHA ni límite de intentos todavía. Es un blanco fácil para spam de
 * registros (cuentas de prueba falsas, invitaciones masivas a correos
 * ajenos) apenas la página quede pública de verdad. Antes de anunciar
 * este formulario ampliamente, hay que agregarle al menos un CAPTCHA.
 */
export async function registrarEmpresaPublica(datos: DatosRegistroPublico) {
  if (!datos.nombreEmpresa?.trim() || !datos.nombreAdmin?.trim() || !datos.emailAdmin?.trim()) {
    return { error: 'Nombre de la empresa, tu nombre y tu correo son obligatorios.' };
  }
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.emailAdmin);
  if (!emailValido) {
    return { error: 'Ese correo no parece válido.' };
  }

  const admin_db = supabaseAdmin();

  const DIAS_PRUEBA = 30;
  const trialTerminaEn = new Date(Date.now() + DIAS_PRUEBA * 86400000);

  const { data: empresa, error: errorEmpresa } = await admin_db
    .from('empresas')
    .insert({
      nombre: datos.nombreEmpresa.trim(),
      estado: 'trial',
      trial_termina_en: trialTerminaEn.toISOString(),
    })
    .select()
    .single();
  if (errorEmpresa || !empresa) return { error: 'No se pudo crear la cuenta. Intenta de nuevo en un momento.' };

  const { data: configGlobal } = await admin_db
    .from('configuracion_sistema')
    .select('umbral_extra_default')
    .eq('id', true)
    .maybeSingle();

  await admin_db.from('configuracion_empresa').insert({
    empresa_id: empresa.id,
    hora_inicio_extra: configGlobal?.umbral_extra_default ?? '17:00',
  });

  const { data: planPrueba } = await admin_db.from('planes').select('id').eq('clave', 'pro').single();
  if (planPrueba) {
    await admin_db.from('suscripciones').insert({
      empresa_id: empresa.id,
      plan_id: planPrueba.id,
      facturacion: 'monthly',
      fecha_renovacion: trialTerminaEn.toISOString(),
      estado: 'active',
    });
  }

  const { data: nuevaCuenta, error: errorAuth } = await admin_db.auth.admin.inviteUserByEmail(datos.emailAdmin.trim(), { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/nueva-clave` });
  if (errorAuth || !nuevaCuenta.user) {
    // Caso más común: ya existe una cuenta con ese correo en el sistema.
    const yaExiste = errorAuth?.message?.toLowerCase().includes('already');
    return {
      error: yaExiste
        ? 'Ya existe una cuenta con ese correo. Si es tuya, inicia sesión en vez de registrarte de nuevo.'
        : 'No se pudo enviar la invitación a ese correo. Verifica que esté bien escrito.',
    };
  }

  const { error: errorUsuario } = await admin_db.from('usuarios').insert({
    id: nuevaCuenta.user.id,
    empresa_id: empresa.id,
    nombre: datos.nombreAdmin.trim(),
    email: datos.emailAdmin.trim(),
    telefono: datos.telefonoAdmin?.trim() || null,
    rol: 'admin',
    idioma_preferido: datos.idioma,
    estado: 'activo',
  });
  if (errorUsuario) return { error: 'No se pudo terminar de crear tu cuenta. Escríbenos e intenta de nuevo.' };

  return { ok: true };
}
