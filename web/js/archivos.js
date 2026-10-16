// Subida de archivos (PDF o foto, hasta 10 MB) al depósito privado "documentos". Ruta: <compañía>/<id>.<ext>
import { api, ApiError } from "./api.js";
import { t } from "./i18n.js";
import { mensajeError } from "./ui.js";

export async function subirDocumento(ctx, archivo, carpeta = "") {
  if (!archivo || !archivo.size) return {};
  if (archivo.size > 10 * 1024 * 1024) throw new ApiError(t("venc.archivo_grande"), 0);
  if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(archivo.type)) throw new ApiError(t("venc.archivo_tipo"), 0);
  const ext = archivo.type === "application/pdf" ? "pdf" : archivo.type.split("/")[1].replace("jpeg", "jpg");
  const ruta = `${ctx.empresa.id}/${carpeta ? `${carpeta}/` : ""}${crypto.randomUUID()}.${ext}`;
  await api.subirArchivo("documentos", ruta, archivo);
  return { ruta, nombre: archivo.name.slice(0, 120) };
}

// Los errores de validación del archivo ya vienen en el idioma de la persona; los demás pasan por mensajeError.
export const mensajeArchivo = (e) => (e instanceof ApiError && e.status === 0 && e.message !== "sin_conexion" ? e.message : mensajeError(e));
