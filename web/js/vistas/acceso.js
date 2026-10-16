// Entrar y cambio obligatorio de contraseña.
import { api } from "../api.js";
import { t, idioma, fijarIdioma, IDIOMAS } from "../i18n.js";
import { html, crudo, mensajeError, ocupado, aviso } from "../ui.js";
import { marcaGuardada, tieneMarca, logoHtml, nombreMarca } from "../marca.js";

const cabAcceso = () => {
  const m = marcaGuardada();
  return m && tieneMarca(m) ? html`<div class="acceso-marca">${crudo(logoHtml(m))}<div class="marca-grande">${nombreMarca(m)}</div></div>` : html`<div class="marca-grande">ObraPay</div>`;
};

export function vistaEntrar(raiz, alEntrar, errorInicial = "") {
  const pintar = (error = "") => {
    document.title = (() => { const m = marcaGuardada(); return m && tieneMarca(m) ? nombreMarca(m) : "ObraPay"; })();
    raiz.innerHTML = String(html`
      <div class="acceso">
        <form class="tarjeta-acceso" id="form-entrar" novalidate>
          <div class="acceso-cab">
            ${cabAcceso()}
            <label class="idioma"><span class="oculto">${t("comun.idioma")}</span>
              <select id="idioma-acceso" aria-label="${t("comun.idioma")}">
                ${IDIOMAS.map(([c, n]) => html`<option value="${c}" ${c === idioma() ? html`selected` : ""}>${n}</option>`)}
              </select>
            </label>
          </div>
          <h1>${t("acceso.titulo")}</h1>
          <p class="sub">${t("acceso.sub")}</p>
          <div class="campo">
            <label for="usuario">${t("acceso.usuario")}</label>
            <input id="usuario" name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="juan.perez">
          </div>
          <div class="campo">
            <label for="clave">${t("acceso.clave")}</label>
            <input id="clave" name="clave" type="password" autocomplete="current-password" required>
          </div>
          ${error ? html`<p class="error-form" role="alert">${error}</p>` : ""}
          <button class="btn btn-pri btn-grande" type="submit">${t("acceso.entrar")}</button>
          <p class="ayuda">${t("acceso.olvido")}</p>
        </form>
      </div>`);
    raiz.querySelector("#idioma-acceso").addEventListener("change", (ev) => {
      fijarIdioma(ev.target.value);
      pintar();
    });
    const form = raiz.querySelector("#form-entrar");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const usuario = form.usuario.value.trim();
      const clave = form.clave.value;
      if (!usuario || !clave) { pintar(t("acceso.faltan")); return; }
      try {
        await ocupado(form.querySelector("button[type=submit]"), () => api.entrar(usuario, clave));
        alEntrar();
      } catch (e) {
        pintar(mensajeError(e));
        const u = raiz.querySelector("#usuario");
        if (u) u.value = usuario;
      }
    });
    raiz.querySelector(error ? "#clave" : "#usuario").focus();
  };
  pintar(errorInicial);
}

export function vistaCambiarClave(raiz, ctx, alTerminar) {
  const pintar = (error = "") => {
    raiz.innerHTML = String(html`
      <div class="acceso">
        <form class="tarjeta-acceso" id="form-clave" novalidate>
          <div class="marca-grande">ObraPay</div>
          <h1>${t("clave.titulo")}</h1>
          <p class="sub">${t("clave.sub", { nombre: ctx.perfil.nombre })}</p>
          <div class="campo">
            <label for="nueva">${t("clave.nueva")}</label>
            <input id="nueva" name="nueva" type="password" autocomplete="new-password" minlength="8" required aria-describedby="regla-clave">
            <p class="nota" id="regla-clave">${t("clave.regla")}</p>
          </div>
          <div class="campo">
            <label for="repetir">${t("clave.repetir")}</label>
            <input id="repetir" name="repetir" type="password" autocomplete="new-password" required>
          </div>
          ${error ? html`<p class="error-form" role="alert">${error}</p>` : ""}
          <button class="btn btn-pri btn-grande" type="submit">${t("clave.guardar")}</button>
        </form>
      </div>`);
    const form = raiz.querySelector("#form-clave");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nueva = form.nueva.value;
      if (nueva.length < 8) { pintar(t("clave.corta")); return; }
      if (nueva !== form.repetir.value) { pintar(t("clave.no_coincide")); return; }
      try {
        await ocupado(form.querySelector("button[type=submit]"), () => api.cambiarClave(nueva));
        aviso(t("clave.lista"));
        alTerminar();
      } catch (e) { pintar(mensajeError(e)); }
    });
    raiz.querySelector("#nueva").focus();
  };
  pintar();
}
