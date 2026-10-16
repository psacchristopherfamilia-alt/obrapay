// Términos de uso, política de privacidad y la aceptación obligatoria al entrar.
import { api } from "../api.js";
import { t } from "../i18n.js";
import { html, ocupado, aviso, mensajeError } from "../ui.js";

// Súbela cuando cambien los textos: se le pedirá aceptar de nuevo a todo el mundo.
export const TERMINOS_VERSION = "2026-10-1";
const SECCIONES = { terminos: ["t", 8], privacidad: ["p", 7] };

export function vistaLegal(raiz, cual) {
  const [letra, n] = SECCIONES[cual] || SECCIONES.terminos;
  document.title = `${t(`legal.${letra}.titulo`)} · ObraPay`;
  raiz.innerHTML = String(html`
    <div class="legal">
      <button type="button" class="btn btn-fantasma btn-chico" id="legal-volver">← ${t("legal.volver")}</button>
      <h1>${t(`legal.${letra}.titulo`)}</h1>
      <p class="sub">${t("legal.borrador")}</p>
      ${Array.from({ length: n }, (_, i) => html`<section><h2>${i + 1}. ${t(`legal.${letra}.${i + 1}.t`)}</h2><p>${t(`legal.${letra}.${i + 1}.p`)}</p></section>`)}
    </div>`);
  raiz.querySelector("#legal-volver").addEventListener("click", () => { location.hash = ""; });
  window.scrollTo(0, 0);
}

export function vistaAceptar(raiz, alTerminar) {
  raiz.innerHTML = String(html`
    <div class="acceso">
      <form class="tarjeta-acceso" id="form-aceptar" novalidate>
        <div class="marca-grande">ObraPay</div>
        <h1>${t("legal.aceptar_t")}</h1>
        <p class="sub">${t("legal.aceptar_txt")}</p>
        <p><a href="#/terminos">${t("legal.leer_t")}</a><br><a href="#/privacidad">${t("legal.leer_p")}</a></p>
        <label class="casilla"><input type="checkbox" id="acepto"> <span>${t("legal.acepto")}</span></label>
        <button class="btn btn-pri btn-grande" type="submit" disabled>${t("legal.continuar")}</button>
      </form>
    </div>`);
  const form = raiz.querySelector("#form-aceptar");
  const boton = form.querySelector("button[type=submit]");
  form.querySelector("#acepto").addEventListener("change", (ev) => { boton.disabled = !ev.target.checked; });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!form.querySelector("#acepto").checked) return;
    try {
      await ocupado(boton, () => api.rpc("aceptar_terminos", { p_version: TERMINOS_VERSION }));
      alTerminar();
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
}

export const enlacesLegales = () => html`<p class="legal-pie"><a href="#/terminos">${t("ay.terminos")}</a> · <a href="#/privacidad">${t("ay.privacidad")}</a></p>`;
