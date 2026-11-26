/* ======================================================================
   MOTRIX — módulo Configuración
   * Cuenta: datos del usuario y cambio de contraseña (servidor).
   * Preferencias de este navegador: duración y meta de repeticiones.
   Las credenciales MQTT ya no se configuran aquí ni en el navegador:
   viven en el archivo .env del servidor.
   ====================================================================== */
window.MotrixViews = window.MotrixViews || {};
window.MotrixViews.configuracion = function (container, h) {
  const c = MotrixStorage.obtenerConfiguracion();
  const u = h.usuario;
  container.innerHTML = `
    <div class="module-view">
      <div class="module-header"><div><h1>Configuración</h1><p>Tu cuenta y las preferencias de este navegador.</p></div></div>
      <div class="settings-grid">
        <section class="module-card">
          <h2>Mi cuenta</h2>
          <dl class="detail-list">
            <div><dt>Nombre</dt><dd>${h.esc(u.nombre)}</dd></div>
            <div><dt>Usuario</dt><dd>${h.esc(u.usuario)}</dd></div>
            <div><dt>Correo</dt><dd>${h.esc(u.correo)}</dd></div>
            <div><dt>Rol</dt><dd>${u.rol === "ADMIN" ? "Administrador" : "Usuario"}</dd></div>
          </dl>
        </section>
        <form class="module-card" id="formPassword" novalidate>
          <h2>Cambiar contraseña</h2>
          <label>Contraseña actual<input type="password" name="actual" autocomplete="current-password" required></label>
          <label>Contraseña nueva<input type="password" name="nueva" autocomplete="new-password" required><span class="campo-ayuda">Mínimo 8 caracteres, con letras y números. Se cerrarán tus otras sesiones abiertas.</span></label>
          <label>Repite la contraseña nueva<input type="password" name="confirmar" autocomplete="new-password" required></label>
          <p class="form-error" id="errorPassword" role="alert" hidden></p>
          <div class="settings-actions"><button class="module-btn primary" type="submit">Cambiar contraseña</button></div>
        </form>
        <form class="module-card" id="formPreferencias">
          <h2>Preferencias de terapia</h2>
          <p class="muted">Se guardan solo en este navegador.</p>
          <label>Duración predeterminada al registrar pacientes (min)<input id="cfgDuracion" type="number" min="1" max="120" value="${Number(c.duracionPredeterminada) || 20}"></label>
          <label>Meta de repeticiones por sesión<input id="cfgReps" type="number" min="1" max="1000" value="${Number(c.metaRepeticiones) || 30}"></label>
          <div class="settings-actions"><button type="submit" class="module-btn primary">Guardar preferencias</button></div>
        </form>
        <section class="module-card">
          <h2>Conexión con los equipos</h2>
          <p class="muted">El servidor se conecta al broker MQTT con las credenciales del archivo <code>.env</code> (MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD). El navegador nunca recibe esas credenciales.</p>
          <button class="module-btn" id="irDispositivos">Ver estado de los equipos</button>
        </section>
      </div>
    </div>`;

  document.getElementById("irDispositivos").onclick = () => h.irA("dispositivos");

  document.getElementById("formPreferencias").onsubmit = (e) => {
    e.preventDefault();
    MotrixStorage.guardarConfiguracion({
      ...c,
      duracionPredeterminada: Number(document.getElementById("cfgDuracion").value) || 20,
      metaRepeticiones: Number(document.getElementById("cfgReps").value) || 30,
    });
    h.toast("Preferencias guardadas. La meta se aplica al recargar el panel.", "success");
  };

  const form = document.getElementById("formPassword");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById("errorPassword");
    err.hidden = true;
    if (form.nueva.value !== form.confirmar.value) { err.textContent = "Las contraseñas nuevas no coinciden."; err.hidden = false; return; }
    try {
      const r = await MotrixApi.post("/auth/cambiar-password", { actual: form.actual.value, nueva: form.nueva.value });
      form.reset();
      h.toast(r.mensaje, "success");
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
};
