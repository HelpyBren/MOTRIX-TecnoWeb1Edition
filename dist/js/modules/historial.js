/* ======================================================================
   MOTRIX — módulo Historial y exportación a Excel
   Los filtros se aplican en el servidor; la tabla y el archivo .xlsx
   usan exactamente la misma consulta y respetan los permisos del usuario.
   ====================================================================== */
window.MotrixViews = window.MotrixViews || {};
window.MotrixViews.historial = function (container, h) {
  let sesiones = [];
  const TERAPIAS = [["Flexión", "Flexión-Extensión"], ["Extensión", "Abducción-Aducción"], ["Pronación", "Rotación interna y externa"], ["Supinación", "Circunducción plana"]];

  function render() {
    container.innerHTML = `
      <div class="module-view">
        <div class="module-header">
          <div><h1>Historial y exportación</h1><p>Consulta las sesiones guardadas y descárgalas en Excel con los mismos filtros.</p></div>
        </div>
        <form class="module-card filtros" id="formFiltros" novalidate>
          <div class="filtros__grid">
            <label>Desde<input type="date" name="desde"></label>
            <label>Hasta<input type="date" name="hasta"></label>
            <label>Paciente<select name="pacienteId"><option value="">Todos</option></select></label>
            <label>Terapia<select name="terapia"><option value="">Todas</option>${TERAPIAS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
            <label>Equipo<select name="dispositivoId"><option value="">Todos</option><option value="ninguno">Sin equipo registrado</option></select></label>
            ${h.esAdmin ? `<label>Registrada por<select name="usuarioId"><option value="">Cualquiera</option><option value="ninguno">Registros históricos (sin usuario)</option></select></label>` : ""}
            <label class="filtros__busqueda">Buscar<input type="search" name="q" placeholder="Paciente, ID o terapia"></label>
          </div>
          <div class="filtros__acciones">
            <button type="reset" class="module-btn">Limpiar filtros</button>
            <span class="module-count" id="contadorHistorial" aria-live="polite"></span>
            <button type="button" class="module-btn" id="exportarTodo" title="Todos los registros a los que tienes acceso">Exportar todo (.xlsx)</button>
            <button type="button" class="module-btn primary" id="exportarFiltrado">Exportar filtrado (.xlsx)</button>
          </div>
        </form>
        <div class="module-card">
          <div class="table-wrap"><table class="motrix-table">
            <thead><tr><th scope="col">Fecha</th><th scope="col">Paciente</th><th scope="col">Terapia</th><th scope="col" class="num">Duración</th><th scope="col" class="num">Reps.</th><th scope="col" class="num">RMS prom.</th><th scope="col" class="num">Fuerza máx.</th><th scope="col">Equipo</th></tr></thead>
            <tbody id="tablaHistorial"><tr><td colspan="8" class="empty-state">Cargando…</td></tr></tbody>
          </table></div>
        </div>
      </div>
      <div class="module-modal hidden" id="modalSesion" role="dialog" aria-modal="true" aria-labelledby="tituloSesion">
        <div class="module-modal__box small">
          <div class="module-modal__head"><h2 id="tituloSesion">Detalle de sesión</h2><button class="modal-close" id="cerrarDetalle" aria-label="Cerrar">×</button></div>
          <div id="detalleSesion"></div>
        </div>
      </div>`;

    const form = document.getElementById("formFiltros");
    let espera;
    form.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(cargar, 300); });
    form.addEventListener("reset", () => setTimeout(cargar, 0));
    form.addEventListener("submit", (e) => { e.preventDefault(); cargar(); });
    document.getElementById("exportarFiltrado").onclick = (e) => exportar(e.currentTarget, filtrosQuery());
    document.getElementById("exportarTodo").onclick = (e) => exportar(e.currentTarget, "");
    document.getElementById("cerrarDetalle").onclick = cerrarDetalle;
    document.getElementById("modalSesion").addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarDetalle(); });
    cargarOpciones();
    cargar();
  }

  async function cargarOpciones() {
    const form = document.getElementById("formFiltros");
    try {
      const [pacientes, disp, usuarios] = await Promise.all([
        MotrixApi.get("/pacientes"),
        MotrixApi.get("/dispositivos"),
        h.esAdmin ? MotrixApi.get("/usuarios") : Promise.resolve([]),
      ]);
      form.pacienteId.insertAdjacentHTML("beforeend", pacientes.sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map((p) => `<option value="${h.esc(p.id)}">${h.esc(p.nombre)} · ${h.esc(p.id.slice(0, 6))}</option>`).join(""));
      form.dispositivoId.insertAdjacentHTML("beforeend", disp.dispositivos.map((d) => `<option value="${d.id}">${h.esc(d.nombre)} (${h.esc(d.codigo)})</option>`).join(""));
      if (form.usuarioId) form.usuarioId.insertAdjacentHTML("beforeend", usuarios.map((u) => `<option value="${h.esc(u.id)}">${h.esc(u.nombre)}</option>`).join(""));
    } catch (e) { h.toast(e.message, "danger"); }
  }

  function filtrosQuery() {
    const form = document.getElementById("formFiltros");
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) if (String(v).trim()) params.set(k, String(v).trim());
    return params.toString();
  }

  async function cargar() {
    const q = filtrosQuery();
    const tbody = document.getElementById("tablaHistorial");
    try {
      sesiones = await MotrixApi.get(`/sesiones${q ? `?${q}` : ""}`);
      pintar();
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${h.esc(e.message)}</td></tr>`;
    }
    const filtrado = document.getElementById("exportarFiltrado");
    if (filtrado) filtrado.disabled = !q;
  }

  function pintar() {
    const tbody = document.getElementById("tablaHistorial");
    if (!tbody) return;
    document.getElementById("contadorHistorial").textContent = `${sesiones.length} sesión(es)`;
    tbody.innerHTML = sesiones.length ? sesiones.map((s) => `
      <tr class="history-row" data-id="${h.esc(s.id)}" tabindex="0" aria-label="Ver detalle de la sesión de ${h.esc(s.pacienteNombre)}">
        <td>${h.formatearFecha(s.fecha)}</td>
        <td><strong>${h.esc(s.pacienteNombre)}</strong>${s.registradaPor ? `<small class="table-sub">por ${h.esc(s.registradaPor.nombre)}</small>` : ""}</td>
        <td>${h.esc(s.terapia || "—")}</td>
        <td class="num">${h.formatearSeg(s.duracionSeg)}</td>
        <td class="num">${s.repeticiones}</td>
        <td class="num">${Number(s.rmsPromedio || 0).toFixed(2)}</td>
        <td class="num">${Number(s.fuerzaMaxima || 0).toFixed(1)} N</td>
        <td>${s.dispositivo ? h.esc(s.dispositivo.codigo) : '<span class="muted">—</span>'}</td>
      </tr>`).join("")
      : `<tr><td colspan="8" class="empty-state">No hay sesiones con estos filtros.</td></tr>`;
    tbody.querySelectorAll(".history-row").forEach((row) => {
      const abrir = () => mostrarDetalle(sesiones.find((s) => s.id === row.dataset.id));
      row.onclick = abrir;
      row.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } };
    });
  }

  async function exportar(boton, query) {
    const texto = boton.textContent;
    boton.disabled = true;
    boton.textContent = "Generando…";
    try {
      const nombre = await MotrixApi.descargar(`/exportar/sesiones.xlsx${query ? `?${query}` : ""}`, "motrix_sesiones.xlsx");
      h.toast(`Descargado: ${nombre}`, "success");
    } catch (e) {
      h.toast(e.message, "danger");
    } finally {
      boton.textContent = texto;
      boton.disabled = boton.id === "exportarFiltrado" ? !filtrosQuery() : false;
    }
  }

  function mostrarDetalle(s) {
    if (!s) return;
    const fila = (k, v) => `<div><span>${k}</span><strong>${v}</strong></div>`;
    document.getElementById("detalleSesion").innerHTML = `<div class="detail-list">
      ${fila("Paciente", h.esc(s.pacienteNombre))}
      ${fila("Fecha", h.formatearFecha(s.fecha, { dateStyle: "full", timeStyle: "short" }))}
      ${fila("Terapia", h.esc(s.terapia || "—"))}
      ${fila("Duración", h.formatearSeg(s.duracionSeg))}
      ${fila("Repeticiones", s.repeticiones)}
      ${fila("RMS promedio", `${Number(s.rmsPromedio || 0).toFixed(2)} mV`)}
      ${fila("Fuerza máxima", `${Number(s.fuerzaMaxima || 0).toFixed(1)} N`)}
      ${fila("Ángulo promedio", s.anguloPromedio ? `${Number(s.anguloPromedio).toFixed(0)}°` : "Sin dato")}
      ${fila("Temperatura promedio", s.temperaturaPromedio ? `${Number(s.temperaturaPromedio).toFixed(1)} °C` : "Sin dato")}
      ${fila("Equipo", s.dispositivo ? h.esc(`${s.dispositivo.nombre} (${s.dispositivo.codigo})`) : "No registrado")}
      ${fila("Registrada por", s.registradaPor ? h.esc(s.registradaPor.nombre) : "Registro histórico")}
    </div>
    ${h.esAdmin ? `<div class="form-actions"><button class="module-btn danger-btn" id="eliminarSesion">Eliminar sesión</button></div>` : ""}`;
    document.getElementById("modalSesion").classList.remove("hidden");
    document.getElementById("cerrarDetalle").focus();
    const del = document.getElementById("eliminarSesion");
    if (del) del.onclick = async () => {
      if (!(await h.confirmar("La sesión se eliminará de la base de datos.", { titulo: "Eliminar sesión", aceptar: "Eliminar", peligro: true }))) return;
      try { await MotrixApi.del(`/sesiones/${encodeURIComponent(s.id)}`); cerrarDetalle(); h.toast("Sesión eliminada.", "success"); cargar(); }
      catch (e) { h.toast(e.message, "danger"); }
    };
  }
  function cerrarDetalle() { document.getElementById("modalSesion")?.classList.add("hidden"); }

  render();
};
