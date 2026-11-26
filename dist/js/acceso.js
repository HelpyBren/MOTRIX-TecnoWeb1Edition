/* ======================================================================
   MOTRIX — acceso.js
   Formularios de inicio de sesión, registro, recuperación y
   restablecimiento de contraseña. Toda la validación real ocurre en el
   servidor; aquí solo se guía al usuario y se muestran los mensajes.
   ====================================================================== */
(function () {
  "use strict";

  const form = document.querySelector("[data-form]");
  if (!form) return;
  const tipo = form.dataset.form;
  const aviso = document.getElementById("aviso");
  const boton = form.querySelector('button[type="submit"]');

  function mostrar(mensaje, clase = "error") {
    aviso.textContent = mensaje;
    aviso.className = `aviso aviso--${clase}`;
    aviso.hidden = false;
    aviso.setAttribute("role", clase === "error" ? "alert" : "status");
  }
  function ocultar() { aviso.hidden = true; }

  function ocupado(si, texto) {
    boton.disabled = si;
    if (texto) boton.textContent = texto;
  }

  // Mostrar / ocultar contraseña
  form.querySelectorAll("[data-ver]").forEach((b) => {
    b.addEventListener("click", () => {
      const input = document.getElementById(b.dataset.ver);
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      b.textContent = visible ? "Mostrar" : "Ocultar";
      b.setAttribute("aria-pressed", String(!visible));
    });
  });

  function destinoSeguro() {
    const next = new URLSearchParams(location.search).get("next") || "";
    // Solo rutas internas para evitar redirecciones abiertas.
    return /^\/[A-Za-z0-9_\-./?=&%]*$/.test(next) && !next.startsWith("//") ? next : "dashboard.html";
  }

  const textoOriginal = boton.textContent;

  async function enviar(ev) {
    ev.preventDefault();
    ocultar();
    form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    const datos = Object.fromEntries(new FormData(form).entries());
    const faltante = Array.from(form.querySelectorAll("[required]")).find((i) => !String(i.value).trim());
    if (faltante) {
      faltante.setAttribute("aria-invalid", "true");
      faltante.focus();
      return mostrar("Completa los campos obligatorios.");
    }

    try {
      if (tipo === "login") {
        ocupado(true, "Ingresando…");
        await MotrixApi.post("/auth/login", { identificador: datos.identificador, password: datos.password }, { redirigir401: false });
        location.href = destinoSeguro();
        return;
      }
      if (tipo === "recuperar") {
        ocupado(true, "Enviando…");
        const r = await MotrixApi.post("/auth/recuperar", { correo: datos.correo });
        mostrar(r.mensaje, "ok");
        form.reset();
      }
      if (tipo === "restablecer") {
        if (datos.password !== datos.confirmar) {
          document.getElementById("confirmar").setAttribute("aria-invalid", "true");
          return mostrar("Las contraseñas no coinciden.");
        }
        const token = new URLSearchParams(location.hash.slice(1)).get("token");
        if (!token) return mostrar("El enlace no es válido. Solicita uno nuevo desde «Recuperar contraseña».");
        ocupado(true, "Guardando…");
        const r = await MotrixApi.post("/auth/restablecer", { token, password: datos.password });
        history.replaceState(null, "", location.pathname); // borra el token de la barra de direcciones
        mostrar(`${r.mensaje} Te llevamos al inicio de sesión…`, "ok");
        setTimeout(() => { location.href = "login.html"; }, 2200);
        return;
      }
      if (tipo === "registro") {
        if (datos.password !== datos.confirmar) {
          document.getElementById("confirmar").setAttribute("aria-invalid", "true");
          return mostrar("Las contraseñas no coinciden.");
        }
        ocupado(true, "Creando cuenta…");
        const r = await MotrixApi.post("/auth/registro", {
          nombre: datos.nombre, usuario: datos.usuario, correo: datos.correo, password: datos.password,
        });
        mostrar(r.mensaje, "ok");
        form.reset();
      }
    } catch (e) {
      mostrar(e.message);
    } finally {
      ocupado(false, textoOriginal);
    }
  }

  form.addEventListener("submit", enviar);

  // Mensajes de contexto
  const params = new URLSearchParams(location.search);
  if (tipo === "login" && params.get("salida") === "1") mostrar("Cerraste sesión correctamente.", "ok");

  // Enlace de registro solo si el servidor lo permite; si ya hay sesión, ir al panel.
  if (tipo === "login") {
    MotrixApi.get("/auth/opciones", { redirigir401: false }).then((o) => {
      const enlace = document.getElementById("enlaceRegistro");
      if (enlace && o.registroHabilitado) enlace.hidden = false;
    }).catch(() => {});
    MotrixApi.get("/auth/me", { redirigir401: false }).then(() => { location.href = destinoSeguro(); }).catch(() => {});
  }
  if (tipo === "registro") {
    MotrixApi.get("/auth/opciones", { redirigir401: false }).then((o) => {
      if (!o.registroHabilitado) {
        form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
        mostrar("El registro público está deshabilitado. Pide a un administrador que cree tu cuenta.");
      }
    }).catch(() => {});
  }
})();
