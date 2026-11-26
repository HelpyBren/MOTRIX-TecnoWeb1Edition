/* ======================================================================
   MOTRIX — módulo Sesiones
   Estado de la sesión en curso y últimas sesiones guardadas en SQLite.
   Los botones reutilizan los mismos controles del monitor en vivo.
   ====================================================================== */
window.MotrixViews = window.MotrixViews || {};
window.MotrixViews.sesiones = function (container, h) {
  let reloj = null;

  function render() {
    const p = MotrixStorage.obtenerPacienteActivo();
    const a = h.obtenerEstadoSesion();
    const disp = h.obtenerEstadoDispositivo();
    const estadoTxt = a.iniciada ? (a.pausada ? "En pausa" : "En curso") : "Lista para iniciar";
    container.innerHTML = `
      <div class="module-view">
        <div class="module-header"><div><h1>Sesiones</h1><p>Control de la sesión de terapia y registros recientes.</p></div></div>
        <div class="session-grid">
          <div class="module-card session-main">
            <div class="session-status">
              <span class="status-pill ${a.iniciada ? "online" : "idle"}">${estadoTxt}</span>
              <span>${p ? h.esc(p.nombre) : "Sin paciente activo"} · ${h.esc(disp.dispositivo?.nombre || "sin equipo")}</span>
            </div>
            <div class="session-big-time" id="moduleSessionTime">${h.formatearSeg(a.duracionSeg)}</div>
            <div class="session-label">Duración de la sesión actual</div>
            <div class="session-stats">
              <div><strong>${a.repeticiones}</strong><span>Repeticiones</span></div>
              <div><strong>${a.rms ? a.rms.toFixed(2) : "—"}</strong><span>RMS promedio (mV)</span></div>
              <div><strong>${a.fuerza ? a.fuerza.toFixed(1) : "—"}</strong><span>Fuerza máx. (N)</span></div>
              <div><strong>${disp.online ? "Sí" : "No"}</strong><span>Equipo en línea</span></div>
            </div>
            ${p ? "" : `<p class="aviso-linea">Elige un paciente en <button class="link-btn" data-ir="pacientes">Pacientes</button> para poder iniciar.</p>`}
            <div class="session-actions">
              <button class="module-btn primary" id="moduleStart" ${a.iniciada ? "disabled" : ""}>Iniciar</button>
              <button class="module-btn" id="modulePause" ${a.iniciada ? "" : "disabled"}>${a.pausada ? "Reanudar" : "Pausar"}</button>
              <button class="module-btn danger-btn" id="moduleStop" ${a.iniciada ? "" : "disabled"}>Finalizar y guardar</button>
            </div>
          </div>
          <div class="module-card"><div class="tarjeta-cabecera"><h2>Últimas sesiones</h2><button class="link-btn" data-ir="historial">Ver todas</button></div><div id="miniSessionList" class="mini-session-list"><div class="empty-state">Cargando…</div></div></div>
        </div>
      </div>`;
    document.getElementById("moduleStart").onclick = () => h.iniciar();
    document.getElementById("modulePause").onclick = async () => { await h.pausar(); render(); };
    document.getElementById("moduleStop").onclick = async () => { await h.finalizar(); render(); };
    container.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => h.irA(b.dataset.ir)));
    cargarUltimas();
  }

  async function cargarUltimas() {
    const box = () => document.getElementById("miniSessionList");
    try {
      const filas = await MotrixApi.get("/sesiones?limite=8");
      if (!box()) return;
      box().innerHTML = filas.map((s) => `<div class="mini-session"><div><strong>${h.esc(s.pacienteNombre)}</strong><small>${h.formatearFecha(s.fecha)} · ${h.esc(s.terapia || "—")} · ${s.repeticiones} reps.</small></div><b>${h.formatearSeg(s.duracionSeg)}</b></div>`).join("")
        || `<div class="empty-state">Todavía no hay sesiones guardadas.</div>`;
    } catch (e) {
      if (box()) box().innerHTML = `<div class="empty-state">${h.esc(e.message)}</div>`;
    }
  }

  render();
  // Refresca el cronómetro mientras el módulo esté visible.
  reloj = setInterval(() => {
    const nodo = document.getElementById("moduleSessionTime");
    if (!nodo) return clearInterval(reloj);
    nodo.textContent = h.formatearSeg(h.obtenerEstadoSesion().duracionSeg);
  }, 1000);
};
