// ObraPay · Edge Function: crear trabajador o restablecer su contraseña (solo admin).
// El trabajador entra con un usuario corto (juan.perez); por dentro se guarda como
// juan.perez@obrapay.local, un correo que nunca ve ni recibe.
// La service key solo existe aquí, como secreto de Supabase; nunca llega al navegador.
import { createClient } from "jsr:@supabase/supabase-js@2";

const DOMINIO_INTERNO = "obrapay.local";
const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Crear = {
  accion: "crear";
  usuario: string;
  nombre: string;
  oficio?: string;
  roles?: string[];
  tarifa: number;
  seguro_pct: number;
  vigente_desde: string; // YYYY-MM-DD
  idioma?: "es" | "en" | "ht";
};
type Restablecer = { accion: "restablecer"; perfil_id: string };
type Persona = {
  usuario?: string; nombre?: string; oficio?: string; tarifa?: number; telefono?: string;
  nib?: string; nhip?: string; permiso_numero?: string; permiso_vence?: string;
  licencia_numero?: string; licencia_vence?: string;
};
// Alta de varias personas de una vez (importación de Excel o asistente de alta del dueño de la plataforma).
type Varios = {
  accion: "crear_varios";
  empresa_id?: string; // solo el dueño de la plataforma lo manda; un admin siempre trabaja en su compañía activa
  vigente_desde?: string;
  trabajadores?: Persona[];
  admin?: { perfil_id?: string; usuario?: string; nombre?: string };
  dueno?: { usuario?: string; nombre?: string };
};

const responder = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Contraseña temporal legible: 3 palabras cortas + 2 dígitos; el trabajador la cambia al entrar.
function claveTemporal(): string {
  const p = ["sol", "mar", "isla", "obra", "playa", "coral", "brisa", "tubo", "cable", "muro", "techo", "arena"];
  const n = crypto.getRandomValues(new Uint32Array(4));
  return `${p[n[0] % p.length]}-${p[n[1] % p.length]}-${p[n[2] % p.length]}-${String(n[3] % 100).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return responder(405, { error: "Método no permitido" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // 1. ¿Quién llama? Debe ser admin activo.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: sesion, error: errSesion } = await servicio.auth.getUser(token);
  if (errSesion || !sesion.user) return responder(401, { error: "Sesión no válida" });

  const { data: admin } = await servicio
    .from("perfiles")
    .select("id, empresa_id, empresa_activa_id, roles, activo, asistiendo")
    .eq("id", sesion.user.id)
    .single();
  const { data: dueñoPlataforma } = admin
    ? await servicio.from("plataforma_duenos").select("perfil_id").eq("perfil_id", admin.id).maybeSingle()
    : { data: null };
  const esPlataforma = !!dueñoPlataforma;
  const asistiendo = esPlataforma && !!admin?.asistiendo && !!admin?.empresa_activa_id;
  if (!admin?.activo || !(admin.roles.includes("admin") || esPlataforma)) {
    return responder(403, { error: "No tienes permiso para esta acción" });
  }

  // Compañía activa del admin: la que eligió en el selector, si sigue siendo suya; si no, la de inicio.
  // El dueño de la plataforma que está ayudando a una compañía trabaja en ella.
  let empId: string = admin.empresa_id;
  if (asistiendo) {
    empId = admin.empresa_activa_id!;
  } else if (admin.empresa_activa_id && admin.empresa_activa_id !== admin.empresa_id) {
    const { data: m } = await servicio.from("perfil_empresas").select("empresa_id")
      .eq("perfil_id", admin.id).eq("empresa_id", admin.empresa_activa_id).is("baja_en", null).maybeSingle();
    if (m) empId = admin.empresa_activa_id;
  }

  let cuerpo: Crear | Restablecer | Varios;
  try {
    cuerpo = await req.json();
  } catch {
    return responder(400, { error: "Datos no válidos" });
  }

  // Crear o restablecer solo lo hace un admin (o el dueño de la plataforma mientras ayuda a una compañía).
  if (cuerpo.accion !== "crear_varios" && !admin.roles.includes("admin") && !asistiendo) {
    return responder(403, { error: "No tienes permiso para esta acción" });
  }

  // 2a. Restablecer contraseña de alguien de su empresa
  if (cuerpo.accion === "restablecer") {
    const { data: perfil } = await servicio
      .from("perfiles").select("id").eq("id", cuerpo.perfil_id).single();
    const { data: miembro } = perfil
      ? await servicio.from("perfil_empresas").select("perfil_id").eq("perfil_id", perfil.id).eq("empresa_id", empId).is("baja_en", null).maybeSingle()
      : { data: null };
    if (!perfil || !miembro) return responder(404, { error: "Trabajador no encontrado" });
    const clave = claveTemporal();
    const { error } = await servicio.auth.admin.updateUserById(perfil.id, { password: clave });
    if (error) return responder(500, { error: "No se pudo restablecer la contraseña" });
    await servicio.from("perfiles").update({ debe_cambiar_clave: true }).eq("id", perfil.id);
    return responder(200, { clave_temporal: clave });
  }

  // 2c. Crear varias personas de una vez
  if (cuerpo.accion === "crear_varios") {
    if (esPlataforma && cuerpo.empresa_id) {
      const { data: e } = await servicio.from("empresas").select("id").eq("id", cuerpo.empresa_id).maybeSingle();
      if (!e) return responder(404, { error: "Compañía no encontrada" });
      empId = e.id;
    } else if (!admin.roles.includes("admin") && !asistiendo) {
      return responder(403, { error: "No tienes permiso para esta acción" });
    }
    const lista = cuerpo.trabajadores ?? [];
    if (lista.length > 150) return responder(400, { error: "Máximo 150 personas por carga" });
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(cuerpo.vigente_desde ?? "") ? cuerpo.vigente_desde! : new Date().toISOString().slice(0, 10);
    const fechaOk = (f?: string) => /^\d{4}-\d{2}-\d{2}$/.test(f ?? "") && !isNaN(Date.parse(f!));

    // Crea usuario + perfil; si el usuario ya existe, prueba con un número al final.
    const crearUsuario = async (base: string, nombre: string, roles: string[], oficio?: string, extra: Record<string, unknown> = {}) => {
      for (let i = 0; i < 6; i++) {
        const usuario = i === 0 ? base : `${base}${i + 1}`;
        if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(usuario)) return { error: "Usuario no válido" };
        const clave = claveTemporal();
        const { data: c, error: e } = await servicio.auth.admin.createUser({ email: `${usuario}@${DOMINIO_INTERNO}`, password: clave, email_confirm: true });
        if (e || !c.user) {
          if (/already|registered|exists/i.test(e?.message ?? "")) continue;
          return { error: "No se pudo crear el usuario" };
        }
        const { error: ep } = await servicio.from("perfiles").insert({
          id: c.user.id, empresa_id: empId, usuario, nombre, oficio: oficio || null, roles, idioma: "es", ...extra,
        });
        if (ep) {
          await servicio.auth.admin.deleteUser(c.user.id);
          if (ep.code === "23505") continue;
          return { error: "No se pudo crear el perfil" };
        }
        return { id: c.user.id, usuario, clave_temporal: clave };
      }
      return { error: "Ese usuario ya existe" };
    };
    const sugerido = (nombre: string) => {
      const t = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
      if (!t.length) return "";
      return (t.length > 1 ? `${t[0]}.${t[t.length - 1]}` : t[0]).padEnd(3, "x");
    };
    const limpiarUsuario = (u?: string, nombre?: string) => (u ?? "").trim().toLowerCase() || sugerido(nombre ?? "");

    const resultados: unknown[] = [];
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i];
      const nombre = (p.nombre ?? "").trim();
      const fila = i + 1;
      if (!nombre) { resultados.push({ fila, ok: false, error: "Falta el nombre" }); continue; }
      if (!(Number(p.tarifa) > 0)) { resultados.push({ fila, ok: false, nombre, error: "Falta la tarifa por hora" }); continue; }
      if (p.permiso_vence && !fechaOk(p.permiso_vence)) { resultados.push({ fila, ok: false, nombre, error: "Fecha del permiso de trabajo no válida" }); continue; }
      if (p.licencia_vence && !fechaOk(p.licencia_vence)) { resultados.push({ fila, ok: false, nombre, error: "Fecha de la licencia no válida" }); continue; }
      const base = limpiarUsuario(p.usuario, nombre);
      const r = await crearUsuario(base, nombre, ["trabajador"], p.oficio?.trim(), {
        numero_nib: p.nib?.toString().trim() || null, numero_nhip: p.nhip?.toString().trim() || null,
        telefono: p.telefono?.toString().trim() || null,
      });
      if ("error" in r) { resultados.push({ fila, ok: false, nombre, error: r.error }); continue; }
      const [t, s] = await Promise.all([
        servicio.from("tarifas").insert({ empresa_id: empId, perfil_id: r.id, monto_hora: Number(p.tarifa), vigente_desde: desde, creado_por: admin.id }),
        servicio.from("seguros").insert({ empresa_id: empId, perfil_id: r.id, porcentaje: 0, vigente_desde: desde, creado_por: admin.id }),
      ]);
      if (t.error || s.error) {
        await servicio.from("perfiles").delete().eq("id", r.id);
        await servicio.auth.admin.deleteUser(r.id);
        resultados.push({ fila, ok: false, nombre, error: "No se pudo guardar la tarifa" });
        continue;
      }
      const docs = [];
      if (p.permiso_vence) docs.push({ empresa_id: empId, tipo: "permiso_trabajo", perfil_id: r.id, numero: p.permiso_numero?.toString().trim() || null, vence: p.permiso_vence, creado_por: admin.id });
      if (p.licencia_vence) docs.push({ empresa_id: empId, tipo: "licencia_conducir", perfil_id: r.id, numero: p.licencia_numero?.toString().trim() || null, vence: p.licencia_vence, creado_por: admin.id });
      if (docs.length) await servicio.from("documentos").insert(docs);
      resultados.push({ fila, ok: true, nombre, usuario: r.usuario, clave_temporal: r.clave_temporal });
    }

    // Administrador de la compañía (puede ser un usuario que ya existe) y usuario de solo lectura para el dueño.
    let adminOut: unknown = null;
    if (esPlataforma && cuerpo.admin) {
      if (cuerpo.admin.perfil_id) {
        const { data: existente } = await servicio.from("perfiles").select("id, usuario, nombre, roles").eq("id", cuerpo.admin.perfil_id).maybeSingle();
        if (!existente || !existente.roles.includes("admin")) adminOut = { ok: false, error: "Ese administrador no existe" };
        else {
          await servicio.from("perfil_empresas").upsert({ perfil_id: existente.id, empresa_id: empId, creado_por: admin.id, baja_en: null }, { onConflict: "perfil_id,empresa_id" });
          adminOut = { ok: true, nombre: existente.nombre, usuario: existente.usuario, existente: true };
        }
      } else if (cuerpo.admin.nombre?.trim()) {
        const r = await crearUsuario(limpiarUsuario(cuerpo.admin.usuario, cuerpo.admin.nombre), cuerpo.admin.nombre.trim(), ["admin"]);
        adminOut = "error" in r ? { ok: false, error: r.error } : { ok: true, nombre: cuerpo.admin.nombre.trim(), usuario: r.usuario, clave_temporal: r.clave_temporal };
      }
    }
    let duenoOut: unknown = null;
    if (esPlataforma && cuerpo.dueno?.nombre?.trim()) {
      const r = await crearUsuario(limpiarUsuario(cuerpo.dueno.usuario, cuerpo.dueno.nombre), cuerpo.dueno.nombre.trim(), ["dueno"]);
      duenoOut = "error" in r ? { ok: false, error: r.error } : { ok: true, nombre: cuerpo.dueno.nombre.trim(), usuario: r.usuario, clave_temporal: r.clave_temporal };
    }

    await servicio.from("eventos_admin").insert({
      empresa_id: empId, tipo: "alta_personas", por: admin.id,
      detalle: { creadas: (resultados as { ok: boolean }[]).filter((x) => x.ok).length, con_error: (resultados as { ok: boolean }[]).filter((x) => !x.ok).length },
    });
    return responder(200, { resultados, admin: adminOut, dueno: duenoOut });
  }

  // 2b. Crear trabajador
  if (cuerpo.accion !== "crear") return responder(400, { error: "Acción no válida" });
  const usuario = (cuerpo.usuario ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(usuario)) {
    return responder(400, { error: "Usuario no válido: usa letras, números, punto o guion (3 a 40)" });
  }
  if (!cuerpo.nombre?.trim()) return responder(400, { error: "Falta el nombre" });
  const roles = cuerpo.roles?.length ? cuerpo.roles : ["trabajador"];
  if (!roles.every((r) => ["trabajador", "supervisor", "admin", "dueno"].includes(r))) {
    return responder(400, { error: "Rol no válido" });
  }
  // Tarifa y seguro solo para quien marca horas.
  if (roles.includes("trabajador")) {
    if (!(cuerpo.tarifa > 0)) return responder(400, { error: "La tarifa debe ser mayor que cero" });
    if (!(cuerpo.seguro_pct >= 0 && cuerpo.seguro_pct <= 100)) return responder(400, { error: "Seguro entre 0 y 100 %" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cuerpo.vigente_desde ?? "")) return responder(400, { error: "Fecha no válida" });
  }

  const clave = claveTemporal();
  // La pantalla de entrada arma el mismo correo a partir del usuario escrito.
  // Si un día hay varias empresas, se agrega un código de empresa al inicio de sesión.
  const email = `${usuario}@${DOMINIO_INTERNO}`;
  const { data: creado, error: errCrear } = await servicio.auth.admin.createUser({
    email, password: clave, email_confirm: true,
  });
  if (errCrear || !creado.user) {
    const repetido = /already|registered|exists/i.test(errCrear?.message ?? "");
    return responder(repetido ? 409 : 500, { error: repetido ? "Ese usuario ya existe" : "No se pudo crear el usuario" });
  }

  const id = creado.user.id;
  const { error: errPerfil } = await servicio.from("perfiles").insert({
    id, empresa_id: empId, usuario, nombre: cuerpo.nombre.trim(),
    oficio: cuerpo.oficio?.trim() || null, roles, idioma: cuerpo.idioma ?? "es",
  });
  if (errPerfil) {
    await servicio.auth.admin.deleteUser(id); // no dejar usuarios a medias
    return responder(errPerfil.code === "23505" ? 409 : 500, {
      error: errPerfil.code === "23505" ? "Ese usuario ya existe" : "No se pudo crear el perfil",
    });
  }
  if (roles.includes("trabajador")) {
    const [t, s] = await Promise.all([
      servicio.from("tarifas").insert({
        empresa_id: empId, perfil_id: id, monto_hora: cuerpo.tarifa,
        vigente_desde: cuerpo.vigente_desde, creado_por: admin.id,
      }),
      servicio.from("seguros").insert({
        empresa_id: empId, perfil_id: id, porcentaje: cuerpo.seguro_pct,
        vigente_desde: cuerpo.vigente_desde, creado_por: admin.id,
      }),
    ]);
    if (t.error || s.error) {
      await servicio.from("perfiles").delete().eq("id", id);
      await servicio.auth.admin.deleteUser(id);
      return responder(500, { error: "No se pudo guardar la tarifa o el seguro" });
    }
  }

  await servicio.from("eventos_admin").insert({
    empresa_id: empId, tipo: "trabajador_creado", por: admin.id,
    detalle: { perfil: id, usuario, roles },
  });

  return responder(201, { perfil_id: id, usuario, clave_temporal: clave });
});
