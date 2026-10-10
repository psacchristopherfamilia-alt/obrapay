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
    .select("id, empresa_id, roles, activo")
    .eq("id", sesion.user.id)
    .single();
  if (!admin?.activo || !admin.roles.includes("admin")) {
    return responder(403, { error: "No tienes permiso para esta acción" });
  }

  let cuerpo: Crear | Restablecer;
  try {
    cuerpo = await req.json();
  } catch {
    return responder(400, { error: "Datos no válidos" });
  }

  // 2a. Restablecer contraseña de alguien de su empresa
  if (cuerpo.accion === "restablecer") {
    const { data: perfil } = await servicio
      .from("perfiles").select("id, empresa_id").eq("id", cuerpo.perfil_id).single();
    if (!perfil || perfil.empresa_id !== admin.empresa_id) return responder(404, { error: "Trabajador no encontrado" });
    const clave = claveTemporal();
    const { error } = await servicio.auth.admin.updateUserById(perfil.id, { password: clave });
    if (error) return responder(500, { error: "No se pudo restablecer la contraseña" });
    await servicio.from("perfiles").update({ debe_cambiar_clave: true }).eq("id", perfil.id);
    return responder(200, { clave_temporal: clave });
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
    id, empresa_id: admin.empresa_id, usuario, nombre: cuerpo.nombre.trim(),
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
        empresa_id: admin.empresa_id, perfil_id: id, monto_hora: cuerpo.tarifa,
        vigente_desde: cuerpo.vigente_desde, creado_por: admin.id,
      }),
      servicio.from("seguros").insert({
        empresa_id: admin.empresa_id, perfil_id: id, porcentaje: cuerpo.seguro_pct,
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
    empresa_id: admin.empresa_id, tipo: "trabajador_creado", por: admin.id,
    detalle: { perfil: id, usuario, roles },
  });

  return responder(201, { perfil_id: id, usuario, clave_temporal: clave });
});
