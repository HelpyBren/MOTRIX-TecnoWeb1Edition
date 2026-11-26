/* ======================================================================
   MOTRIX — módulo Usuarios (solo administradores)
   Alta, edición, roles, activación, enlaces de restablecimiento y
   registro de auditoría. El servidor vuelve a validar cada permiso.
   ====================================================================== */
window.MotrixViews = window.MotrixViews || {};
window.MotrixViews.usuarios = function (container, h) {
  let usuarios = [];

  function render() {
    container.innerHTML = `
      <div class="module-view">
        <div class="module-header">
          <div><h1>Usuarios</h1><p>Cuentas con acceso a la plataforma y sus permisos.</p></div>
          <button class="module-btn primary" id="btnNuevoUsuario">Nuevo usuario</button>
        </div>
        <div class="module-card">
          <div class="table-wrap"><table class="motrix-table">
            <thead><tr><th scope="col">Nombre</th><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Último acceso</th><th scope="col" class="num">Pacientes</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody id="tablaUsuarios"><tr><td colspan="7" class="empty-state">Cargando…</td></tr></tbody>
          </table></div>
          <p class="muted nota">Administrador: gestiona usuarios, equipos, todos los pacientes y exportaciones. Usuario: trabaja con los pacientes que tiene asignados.</p>
        </div>
        <details class="module-card auditoria" id="auditoria">
          <summary>Registro de actividad (últimos 100 eventos)</summary>
          <div id="tablaAuditoria" class="table-wrap"><p class="empty-inline">Abre esta sección para cargarlo.</p></div>
        </details>
      </div>
      <div class="module-modal hidden" id="modalUsuario" role="dialog" aria-modal="true" aria-labelledby="tituloUsuario"><div class="module-modal__box" id="cajaUsuario"></div></div>`;
    document.getElementById("btnNuevoUsuario").onclick = () => abrir();
    document.getElementById("modalUsuario").addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
    document.getElementById("auditoria").addEventListener("toggle", (e) => { if (e.target.open) cargarAuditoria(); });
    cargar();
  }

  async function cargar() {
    try { usuarios = await MotrixApi.get("/usuarios"); pintar(); }
    catch (e) { h.toast(e.message, "danger"); }
  }

  function pintar() {
    const tbody = document.getElementById("tablaUsuarios");
    tbody.innerHTML = usuarios.map((u) => {
      const bloqueado = u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date();
      const estado = !u.activo ? '<span class="status-pill idle">Inactivo</span>' : bloqueado ? '<span class="status-pill warn">Bloqueado</span>' : '<span class="status-pill online">Activo</span>';
      return `<tr>
        <td><strong>${h.esc(u.nombre)}</strong>${u.id === h.usuario.id ? ' <small class="muted">(tú)</small>' : ""}<small class="table-sub">${h.esc(u.correo)}</small></td>
        <td>${h.esc(u.usuario)}</td>
        <td>${u.rol === "ADMIN" ? "Administrador" : "Usuario"}</td>
        <td>${estado}</td>
        <td>${u.ultimoAcceso ? h.formatearFecha(u.ultimoAcceso) : '<span class="muted">Nunca</span>'}</td>
        <td class="num">${u._count?.pacientes ?? 0}</td>
        <td><div class="action-group">
          <button class="table-btn" data-a="editar" data-id="${u.id}">Editar</button>
          <button class="table-btn" data-a="enlace" data-id="${u.id}">Enlace de contraseña</button>
          ${u.id !== h.usuario.id ? `<button class="table-btn danger" data-a="eliminar" data-id="${u.id}">Eliminar</button>` : ""}
        </div></td></tr>`;
    }).join("");
    tbody.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => accion(b.dataset.a, b.dataset.id));
  }

  async function accion(a, id) {
    const u = usuarios.find((x) => x.id === id);
    if (a === "editar") return abrir(u);
    if (a === "enlace") {
      try {
        const r = await MotrixApi.post(`/usuarios/${id}/enlace-restablecer`, {});
        mostrarModal(`<div class="module-modal__head"><h2 id="tituloUsuario">Enlace para ${h.esc(u.nombre)}</h2><button class="modal-close" data-cerrar aria-label="Cerrar">×</button></div>
          <p>${h.esc(r.mensaje)} Caduca en 30 minutos.</p><pre class="codigo">${h.esc(r.enlace)}</pre>
          <div class="form-actions"><button class="module-btn" id="copiarEnlace">Copiar</button><button class="module-btn primary" data-cerrar>Listo</button></div>`);
        document.getElementById("copiarEnlace").onclick = () => navigator.clipboard.writeText(r.enlace).then(() => h.toast("Enlace copiado.", "success"), () => h.toast("Selecciona y copia el enlace manualmente.", "warn"));
      } catch (e) { h.toast(e.message, "danger"); }
    }
    if (a === "eliminar") {
      if (!(await h.confirmar(`Se eliminará la cuenta de ${u.nombre}. Sus pacientes y sesiones se conservan sin responsable.`, { titulo: "Eliminar usuario", aceptar: "Eliminar", peligro: true }))) return;
      try { const r = await MotrixApi.del(`/usuarios/${id}`); h.toast(r.mensaje, "success"); cargar(); }
      catch (e) { h.toast(e.message, "danger"); }
    }
  }

  function mostrarModal(html) {
    document.getElementById("cajaUsuario").innerHTML = html;
    document.getElementById("modalUsuario").classList.remove("hidden");
    document.querySelectorAll("#cajaUsuario [data-cerrar]").forEach((b) => b.onclick = cerrar);
    document.querySelector("#cajaUsuario input, #cajaUsuario button")?.focus();
  }
  function cerrar() { document.getElementById("modalUsuario").classList.add("hidden"); }

  function abrir(u = null) {
    mostrarModal(`<div class="module-modal__head"><h2 id="tituloUsuario">${u ? "Editar usuario" : "Nuevo usuario"}</h2><button class="modal-close" data-cerrar aria-label="Cerrar">×</button></div>
      <form class="module-form" id="formUsuario" novalidate>
        <label>Nombre completo<input name="nombre" required maxlength="120" value="${h.esc(u?.nombre || "")}"></label>
        <label>Usuario<input name="usuario" required maxlength="40" value="${h.esc(u?.usuario || "")}" autocomplete="off"></label>
        <label>Correo electrónico<input name="correo" type="email" required value="${h.esc(u?.correo || "")}" autocomplete="off"></label>
        <label>Rol<select name="rol"><option value="USUARIO">Usuario</option><option value="ADMIN">Administrador</option></select></label>
        <label class="full">${u ? "Nueva contraseña (opcional)" : "Contraseña inicial"}<input name="password" type="password" autocomplete="new-password" ${u ? "" : "required"}><span class="campo-ayuda">Mínimo 8 caracteres, con letras y números.${u ? " Déjala vacía para no cambiarla." : ""}</span></label>
        ${u ? `<label class="switch-row full"><input type="checkbox" name="activo" ${u.activo ? "checked" : ""}><span>Cuenta activa</span></label>` : ""}
        <p class="form-error full" id="errorUsuario" role="alert" hidden></p>
        <div class="form-actions"><button type="button" class="module-btn" data-cerrar>Cancelar</button><button class="module-btn primary" type="submit">${u ? "Guardar cambios" : "Crear usuario"}</button></div>
      </form>`);
    const form = document.getElementById("formUsuario");
    form.rol.value = u?.rol || "USUARIO";
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = { nombre: form.nombre.value, usuario: form.usuario.value, correo: form.correo.value, rol: form.rol.value };
      if (form.password.value) body.password = form.password.value;
      if (u) body.activo = form.activo.checked;
      try {
        if (u) await MotrixApi.put(`/usuarios/${u.id}`, body); else await MotrixApi.post("/usuarios", body);
        cerrar();
        h.toast(u ? "Usuario actualizado." : "Usuario creado.", "success");
        cargar();
      } catch (err) {
        const p = document.getElementById("errorUsuario");
        p.textContent = err.message; p.hidden = false;
      }
    };
  }

  const ACCIONES = {
    login: "Inicio de sesión", logout: "Cierre de sesión", login_fallido: "Intento fallido", cuenta_bloqueada: "Cuenta bloqueada",
    exportacion_excel: "Exportación a Excel", paciente_creado: "Paciente creado", paciente_actualizado: "Paciente editado",
    paciente_eliminado: "Paciente eliminado", sesion_registrada: "Sesión guardada", sesion_eliminada: "Sesión eliminada",
    usuario_creado: "Usuario creado", usuario_actualizado: "Usuario editado", usuario_eliminado: "Usuario eliminado",
    wifi_cambio_solicitado: "Cambio de WiFi", wifi_portal_solicitado: "Portal WiFi abierto", dispositivo_creado: "Equipo registrado",
    dispositivo_actualizado: "Equipo editado", dispositivo_eliminado: "Equipo eliminado", clave_dispositivo_consultada: "Clave de equipo consultada",
    password_cambiada: "Contraseña cambiada", password_restablecida: "Contraseña restablecida", recuperacion_solicitada: "Recuperación solicitada",
    enlace_restablecer_generado: "Enlace de contraseña generado", comando_start: "Terapia iniciada", comando_stop: "Terapia detenida", comando_calibrar: "Calibración",
  };

  async function cargarAuditoria() {
    const box = document.getElementById("tablaAuditoria");
    try {
      const filas = await MotrixApi.get("/usuarios/auditoria/recientes");
      box.innerHTML = filas.length ? `<table class="motrix-table compacta"><thead><tr><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Acción</th><th scope="col">IP</th></tr></thead><tbody>
        ${filas.map((f) => `<tr><td>${h.formatearFecha(f.fecha)}</td><td>${h.esc(f.usuario?.nombre || "—")}</td><td>${h.esc(ACCIONES[f.accion] || f.accion)}</td><td>${h.esc(f.ip || "—")}</td></tr>`).join("")}
      </tbody></table>` : `<p class="empty-inline">Sin eventos registrados.</p>`;
    } catch (e) { box.innerHTML = `<p class="empty-inline">${h.esc(e.message)}</p>`; }
  }

  render();
};
