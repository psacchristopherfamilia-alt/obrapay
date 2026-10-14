'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

interface DatosNuevaEmpresa {
  nombreEmpresa: string;
  industria: string;
  direccion: string;
  telefono: string;
  nombreAdmin: string;
  emailAdmin: string;
  telefonoAdmin?: string;
  idioma: 'es' | 'en' | 'ht';
}

export async function crearEmpresa(datos: DatosNuevaEmpresa) {
  // 1. Solo el owner puede dar de alta empresas
  const sesion = supabaseServer();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const { data: quienLlama } = await sesion.from('usuarios').select('rol').eq('id', user.id).single();
  if (!quienLlama || quienLlama.rol !== 'owner') {
    return { error: 'Solo el Creador SaaS puede dar de alta empresas' };
  }

  const admin_db = supabaseAdmin();

  const DIAS_PRUEBA = 30;
  const trialTerminaEn = new Date(Date.now() + DIAS_PRUEBA * 86400000);

  // 2. Empresa
  const { data: empresa, error: errorEmpresa } = await admin_db
    .from('empresas')
    .insert({
      nombre: datos.nombreEmpresa,
      industria: datos.industria,
      direccion: datos.direccion,
      telefono: datos.telefono,
      estado: 'trial',
      trial_termina_en: trialTerminaEn.toISOString(),
    })
    .select()
    .single();
  if (errorEmpresa || !empresa) return { error: errorEmpresa?.message ?? 'No se pudo crear la empresa' };

  // 3. Configuración por defecto (mismos valores que configuracion_sistema
  //    tenga en ese momento, para que una empresa nueva arranque igual que
  //    el resto)
  const { data: configGlobal } = await admin_db
    .from('configuracion_sistema')
    .select('umbral_extra_default')
    .eq('id', true)
    .maybeSingle();

  await admin_db.from('configuracion_empresa').insert({
    empresa_id: empresa.id,
    hora_inicio_extra: configGlobal?.umbral_extra_default ?? '17:00',
  });

  // 4. Suscripción inicial — prueba del plan Profesional por 30 días. Si no
  //    se convierte a un plan pago antes de que termine, vencer_trials()
  //    (cron) la baja sola a Gratuito.
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

  // 5. Cuenta del primer Admin — recibe correo para poner su contraseña,
  //    igual que un trabajador (mismo patrón, mismo motivo: la password
  //    nunca la elige ni la ve nadie más que el dueño de la cuenta)
  const { data: nuevaCuenta, error: errorAuth } = await admin_db.auth.admin.inviteUserByEmail(datos.emailAdmin, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/nueva-clave` });
  if (errorAuth || !nuevaCuenta.user) {
    return { error: errorAuth?.message ?? 'La empresa se creó, pero no se pudo invitar al Admin. Créalo desde Trabajadores.' };
  }

  const { error: errorUsuario } = await admin_db.from('usuarios').insert({
    id: nuevaCuenta.user.id,
    empresa_id: empresa.id,
    nombre: datos.nombreAdmin,
    email: datos.emailAdmin,
    telefono: datos.telefonoAdmin ?? null,
    rol: 'admin',
    idioma_preferido: datos.idioma,
    estado: 'activo',
  });
  if (errorUsuario) return { error: errorUsuario.message };

  return { ok: true, empresaId: empresa.id };
}
