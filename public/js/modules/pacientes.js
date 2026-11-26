/* ======================================================================
   MOTRIX — módulo Pacientes (API + SQLite)
   Usuarios: ven y editan sus pacientes. Administradores: ven todos,
   asignan responsable y pueden eliminar.
   ====================================================================== */
window.MotrixViews = window.MotrixViews || {};
window.MotrixViews.pacientes = function (container, h) {
  let pacientes = [];
  let usuarios = [];
  let filtroResponsable = "";
  const TERAPIAS = [
    ["Flexión", "Flexión-Extensión"], ["Extensión", "Abducción-Aducción"],
    ["Pronación", "Rotación interna y externa"], ["Supinación", "Circunducción plana"],
  ];
  const etiquetaTerapia = (v) => (TERAPIAS.find((t) => t[0] === v) || [v, v || "—"])[1];

  async function cargar() {
    try {
      const q = filtroResponsable ? `?responsableId=${encodeURIComponent(filtroResponsable)}` : "";
      pacientes = await MotrixApi.get(`/pacientes${q}`);
      if (h.esAdmin && !usuarios.length) usuarios = await MotrixApi.get("/usuarios");
      filtrar();
    } catch (e) {
      pintarTabla([]);
      h.toast(e.message, "danger");
    }
  }

  function render() {
    const filtroAdmin = h.esAdmin ? `
      <label class="filtro-inline">Responsable
        <select id="filtroResponsable"><option value="">Todos</option><option value="ninguno">Sin asignar</option></select>
      </label>` : "";
    container.innerHTML = `
      <div class="module-view">
        <div class="module-header">
          <div><h1>Pacientes</h1><p>${h.esAdmin ? "Todos los pacientes registrados en la base de datos." : "Pacientes asignados a tu cuenta."}</p></div>
          <button class="module-btn primary" id="btnNuevoPaciente">Nuevo paciente</button>
        </div>
        <div class="module-card">
          <div class="module-toolbar">
            <label class="sr-only" for="buscarPaciente">Buscar paciente</label>
            <input class="module-search" id="buscarPaciente" type="search" placeholder="Buscar por nombre o ID">
            ${filtroAdmin}
            <span class="module-count" id="contadorPacientes" aria-live="polite"></span>
          </div>
          <div class="table-wrap"><table class="motrix-table">
            <thead><tr><th scope="col">Paciente</th><th scope="col" class="num">Edad</th><th scope="col">Brazo</th><th scope="col">Terapia</th><th scope="col" class="num">Duración</th>${h.esAdmin ? '<th scope="col">Responsable</th>' : ""}<th scope="col" class="num">Sesiones</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody id="tablaPacientes"><tr><td colspan="8" class="empty-state">Cargando…</td></tr></tbody>
          </table></div>
        </div>
      </div>
      <div class="module-modal hidden" id="modalPaciente" role="dialog" aria-modal="true" aria-labelledby="tituloModalPaciente">
        <div class="module-modal__box">
          <div class="module-modal__head"><h2 id="tituloModalPaciente">Nuevo paciente</h2><button class="modal-close" id="cerrarModalPaciente" aria-label="Cerrar">×</button></div>
          <form id="formPacienteModulo" class="module-form" novalidate>
            <input type="hidden" id="pacienteEditId">
            <label>Nombre completo<input id="modNombre" required maxlength="120" autocomplete="off"></label>
            <label>Edad<input id="modEdad" type="number" min="1" max="120" required></label>
            <label>Sexo<select id="modSexo"><option value="">Sin especificar</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select></label>
            <label>Brazo afectado<select id="modBrazo"><option value="">Sin especificar</option><option>Derecho</option><option>Izquierdo</option><option value="Ambos">Ambos</option></select></label>
            <label>Terapia<select id="modTerapia"><option value="">Sin especificar</option>${TERAPIAS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
            <label>Duración de la sesión (min)<input id="modDuracion" type="number" min="1" max="120" value="20"></label>
            ${h.esAdmin ? '<label class="full">Responsable<select id="modResponsable"><option value="">Sin asignar</option></select></label>' : ""}
            <label class="full">Observaciones clínicas<textarea id="modObservaciones" rows="3" maxlength="2000"></textarea></label>
            <p class="form-error full" id="errorPaciente" role="alert" hidden></p>
            <div class="form-actions"><button type="button" class="module-btn" id="cancelarPaciente">Cancelar</button><button type="submit" class="module-btn primary">Guardar paciente</button></div>
          </form>
        </div>
      </div>`;

    document.getElementById("btnNuevoPaciente").onclick = () => abrirModal();
    document.getElementById("cerrarModalPaciente").onclick = cerrarModal;
    document.getElementById("cancelarPaciente").onclick = cerrarModal;
    document.getElementById("formPacienteModulo").onsubmit = guardar;
    document.getElementById("modalPaciente").addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });
    document.getElementById("buscarPaciente").oninput = filtrar;
    const fr = document.getElementById("filtroResponsable");
    if (fr) fr.onchange = () => { filtroResponsable = fr.value; cargar(); };
    cargar().then(() => {
      if (fr) fr.insertAdjacentHTML("beforeend", usuarios.map((u) => `<option value="${h.esc(u.id)}">${h.esc(u.nombre)}</option>`).join(""));
    });
  }

  function filtrar() {
    const q = (document.getElementById("buscarPaciente")?.value || "").toLowerCase().trim();
    pintarTabla(pacientes.filter((p) => `${p.nombre} ${p.id}`.toLowerCase().includes(q)));
  }

  function pintarTabla(lista) {
    const tbody = document.getElementById("tablaPacientes");
    if (!tbody) return;
    const activo = MotrixStorage.obtenerPacienteActivo()?.id;
    document.getElementById("contadorPacientes").textContent = `${lista.length} paciente(s)`;
    const cols = h.esAdmin ? 8 : 7;
    tbody.innerHTML = lista.length ? lista.map((p) => `
      <tr class="${p.id === activo ? "fila-activa" : ""}">
        <td><strong>${h.esc(p.nombre)}</strong>${p.id === activo ? ' <span class="status-pill online">Activo</span>' : ""}<small class="table-sub" title="${h.esc(p.id)}">${h.esc(p.id.slice(0, 8))}…</small></td>
        <td class="num">${h.esc(p.edad)}</td>
        <td>${h.esc(p.brazo || "—")}</td>
        <td>${h.esc(etiquetaTerapia(p.terapia))}</td>
        <td class="num">${h.esc(p.duracionMin ?? 20)} min</td>
        ${h.esAdmin ? `<td>${p.responsable ? h.esc(p.responsable.nombre) : '<span class="muted">Sin asignar</span>'}</td>` : ""}
        <td class="num">${p._count?.sesiones ?? 0}</td>
        <td><div class="action-group">
          <button class="table-btn primario" data-action="seleccionar" data-id="${h.esc(p.id)}">Usar en sesión</button>
          <button class="table-btn" data-action="editar" data-id="${h.esc(p.id)}">Editar</button>
          ${h.esAdmin ? `<button class="table-btn danger" data-action="eliminar" data-id="${h.esc(p.id)}">Eliminar</button>` : ""}
        </div></td>
      </tr>`).join("")
      : `<tr><td colspan="${cols}" class="empty-state">${pacientes.length ? "Ningún paciente coincide con la búsqueda." : "No hay pacientes todavía. Usa «Nuevo paciente» para registrar el primero."}</td></tr>`;

    tbody.querySelectorAll("[data-action]").forEach((btn) => btn.onclick = async () => {
      const p = pacientes.find((x) => x.id === btn.dataset.id);
      if (!p) return;
      if (btn.dataset.action === "seleccionar") {
        MotrixStorage.guardarPacientes([...MotrixStorage.obtenerPacientes().filter((x) => x.id !== p.id), p]);
        MotrixStorage.seleccionarPaciente(p.id);
        h.actualizarPacienteDashboard();
        h.toast(`${p.nombre} es ahora el paciente activo.`, "success");
        h.irA("dashboard");
      } else if (btn.dataset.action === "editar") {
        abrirModal(p);
      } else if (btn.dataset.action === "eliminar") {
        const ok = await h.confirmar(`Se eliminará a ${p.nombre} y sus ${p._count?.sesiones ?? 0} sesión(es). Esta acción no se puede deshacer.`, { titulo: "Eliminar paciente", aceptar: "Eliminar", peligro: true });
        if (!ok) return;
        try {
          await MotrixApi.del(`/pacientes/${encodeURIComponent(p.id)}`);
          MotrixStorage.guardarPacientes(MotrixStorage.obtenerPacientes().filter((x) => x.id !== p.id));
          if (MotrixStorage.obtenerPacienteActivo()?.id === p.id) localStorage.removeItem("motrix_paciente_activo");
          h.actualizarPacienteDashboard();
          h.toast("Paciente eliminado.", "success");
          cargar();
        } catch (e) { h.toast(e.message, "danger"); }
      }
    });
  }

  function abrirModal(p = null) {
    const $ = (id) => document.getElementById(id);
    $("modalPaciente").classList.remove("hidden");
    $("errorPaciente").hidden = true;
    $("tituloModalPaciente").textContent = p ? "Editar paciente" : "Nuevo paciente";
    $("pacienteEditId").value = p?.id || "";
    $("modNombre").value = p?.nombre || "";
    $("modEdad").value = p?.edad ?? "";
    $("modSexo").value = p?.sexo || "";
    $("modBrazo").value = p?.brazo || "";
    $("modTerapia").value = p?.terapia || "";
    $("modDuracion").value = p?.duracionMin ?? MotrixStorage.obtenerConfiguracion().duracionPredeterminada ?? 20;
    $("modObservaciones").value = p?.observaciones || "";
    const sel = $("modResponsable");
    if (sel) {
      sel.innerHTML = `<option value="">Sin asignar</option>` + usuarios.filter((u) => u.activo).map((u) => `<option value="${h.esc(u.id)}">${h.esc(u.nombre)} (${u.rol === "ADMIN" ? "admin" : "usuario"})</option>`).join("");
      sel.value = p ? (p.responsableId || "") : h.usuario.id;
    }
    $("modNombre").focus();
  }
  function cerrarModal() { document.getElementById("modalPaciente")?.classList.add("hidden"); }

  async function guardar(e) {
    e.preventDefault();
    const $ = (id) => document.getElementById(id);
    const id = $("pacienteEditId").value;
    const datos = {
      nombre: $("modNombre").value.trim(),
      edad: Number($("modEdad").value),
      sexo: $("modSexo").value || null,
      brazo: $("modBrazo").value || null,
      terapia: $("modTerapia").value || null,
      duracionMin: Number($("modDuracion").value || 20),
      observaciones: $("modObservaciones").value.trim() || null,
    };
    if ($("modResponsable")) datos.responsableId = $("modResponsable").value || null;
    const error = $("errorPaciente");
    if (!datos.nombre || !Number.isInteger(datos.edad) || datos.edad < 1 || datos.edad > 120) {
      error.textContent = "Escribe el nombre y una edad entre 1 y 120.";
      error.hidden = false;
      return;
    }
    try {
      const p = id ? await MotrixApi.put(`/pacientes/${encodeURIComponent(id)}`, datos) : await MotrixApi.post("/pacientes", datos);
      if (MotrixStorage.obtenerPacienteActivo()?.id === p.id) {
        MotrixStorage.guardarPacientes([...MotrixStorage.obtenerPacientes().filter((x) => x.id !== p.id), p]);
        MotrixStorage.seleccionarPaciente(p.id);
        h.actualizarPacienteDashboard();
      }
      cerrarModal();
      h.toast(id ? "Paciente actualizado." : "Paciente registrado.", "success");
      cargar();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  }

  render();
};
