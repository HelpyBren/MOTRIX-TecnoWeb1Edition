/* ======================================================================
   MOTRIX — ui.js (v2)
   Orquesta el panel: comprueba la sesión, carga el usuario y los
   equipos, recibe la telemetría en tiempo real, controla la sesión de
   terapia y navega entre módulos.
   Cambios principales respecto a v1:
     * Exige sesión iniciada (el servidor también lo valida).
     * Promedio real de RMS y máximo real de fuerza durante la sesión
       (antes se guardaba el último valor mostrado en pantalla).
     * Ángulo, temperatura y batería muestran "Sin datos" si el equipo
       no los envía (el firmware actual no tiene esos sensores).
     * Si la ESP32 termina la sesión por tiempo, se guarda automáticamente.
   ====================================================================== */
(function () {
  "use strict";

  const estado = {
    usuario: null,
    paciente: null,
    dispositivos: [],
    dispositivo: null,
    sesionIniciada: false,
    pausada: false,
    guardando: false,
    tiempoInicio: null,
    acumuladoMs: 0,
    intervaloSesion: null,
    repeticionesMeta: 30,
    ultimoEstadoEsp32: "offline",
    stats: null,
    ultimoRms: undefined,
    vistaActual: null,
  };
  const RING_CIRCUNFERENCIA = 226;
  const $ = (id) => document.getElementById(id);

  const el = {
    reloj: $("relojActual"), chipMqtt: $("chipMqtt"), chipEsp32: $("chipEsp32"),
    miniDeviceDot: $("miniDeviceDot"), miniDeviceText: $("miniDeviceText"),
    pacienteNombre: $("pacienteNombre"), pacienteNombreMini: $("pacienteNombreMini"), pacienteId: $("pacienteId"),
    pacienteEdad: $("pacienteEdad"), pacienteBrazo: $("pacienteBrazo"), pacienteTerapia: $("pacienteTerapia"),
    pacienteAvatar: $("pacienteAvatar"), tiempoSesion: $("tiempoSesion"),
    ringProgress: $("ringProgress"), ringLabel: $("ringLabel"), progresoSub: $("progresoSub"),
    iconEsp32: $("iconEsp32"), txtEsp32: $("txtEsp32"), iconMqtt: $("iconMqtt"), txtMqtt: $("txtMqtt"),
    iconInternet: $("iconInternet"), txtInternet: $("txtInternet"),
    txtSignalQuality: $("txtSignalQuality"), signalBars: $("signalBars"), signalDbm: $("signalDbm"),
    metricRms: $("metricRms"), metricAngulo: $("metricAngulo"), metricReps: $("metricReps"),
    metricFuerza: $("metricFuerza"), metricTemp: $("metricTemp"), metricBateria: $("metricBateria"),
    activityList: $("activityList"), toastStack: $("toastStack"),
    btnStart: $("btnStart"), btnPause: $("btnPause"), btnStop: $("btnStop"), btnCalibrate: $("btnCalibrate"), btnConfig: $("btnConfig"),
    sidebar: $("sidebar"), sidebarOverlay: $("sidebarOverlay"), menuBtn: $("menuBtn"),
    dashboardContent: $("dashboardContent"), moduleContainer: $("moduleContainer"),
    btnClearChart: $("btnClearChart"), chartTools: document.querySelectorAll(".chart-tool-btn[data-range]"),
    selector: $("selectorDispositivo"), tituloVista: $("tituloVista"), topicEmgLabel: $("topicEmgLabel"),
  };

  const TITULOS = {
    resumen: "Resumen", dashboard: "Monitor en vivo", pacientes: "Pacientes", sesiones: "Sesiones",
    dispositivos: "Dispositivos", historial: "Historial y exportación", usuarios: "Usuarios", configuracion: "Configuración",
  };

  /* =================== Utilidades compartidas con módulos =================== */
  function esc(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
  }
  function formatearSeg(seg) {
    const total = Math.max(0, Math.floor(Number(seg) || 0));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const p = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }
  function formatearFecha(iso, opciones = { dateStyle: "medium", timeStyle: "short" }) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-BO", opciones);
  }
  function hace(iso) {
    if (!iso) return "nunca";
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "hace unos segundos";
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }
  function obtenerIniciales(nombre) {
    const partes = String(nombre || "").trim().split(/\s+/);
    return partes.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "·";
  }

  function mostrarToast(mensaje, tipo = "success") {
    if (!el.toastStack) return;
    const toast = document.createElement("div");
    toast.className = `toast ${tipo === "error" ? "danger" : tipo}`;
    toast.setAttribute("role", tipo === "danger" || tipo === "error" ? "alert" : "status");
    toast.textContent = mensaje;
    el.toastStack.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4200);
  }

  /** Diálogo de confirmación accesible (reemplaza confirm()). */
  function confirmar(mensaje, { titulo = "Confirmar", aceptar = "Aceptar", peligro = false } = {}) {
    return new Promise((resolve) => {
      const d = document.createElement("dialog");
      d.className = "dialogo";
      d.innerHTML = `<form method="dialog"><h2>${esc(titulo)}</h2><p>${esc(mensaje)}</p>
        <div class="dialogo__acciones"><button value="no" class="module-btn">Cancelar</button>
        <button value="si" class="module-btn ${peligro ? "danger-btn" : "primary"}">${esc(aceptar)}</button></div></form>`;
      document.body.appendChild(d);
      d.addEventListener("close", () => { resolve(d.returnValue === "si"); d.remove(); });
      d.showModal();
    });
  }

  /* ============================ Sesión de usuario ============================ */
  async function cargarUsuario() {
    const { usuario } = await MotrixApi.get("/auth/me");
    estado.usuario = usuario;
    $("nombreUsuario").textContent = usuario.nombre;
    $("rolUsuario").textContent = usuario.rol === "ADMIN" ? "Administrador" : "Usuario";
    $("avatarUsuario").textContent = obtenerIniciales(usuario.nombre);
    document.body.classList.toggle("es-admin", usuario.rol === "ADMIN");
    document.querySelectorAll(".solo-admin").forEach((n) => { n.hidden = usuario.rol !== "ADMIN"; });
    // Si otra persona usa este navegador, no se mezclan datos locales.
    const anterior = localStorage.getItem("motrix_usuario");
    if (anterior && anterior !== usuario.id) MotrixStorage.limpiarDatosLocales();
    localStorage.setItem("motrix_usuario", usuario.id);
  }

  function configurarMenuUsuario() {
    const boton = $("botonUsuario"), menu = $("menuUsuario");
    const cerrarMenu = () => { menu.hidden = true; boton.setAttribute("aria-expanded", "false"); };
    boton.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      boton.setAttribute("aria-expanded", String(!menu.hidden));
      if (!menu.hidden) menu.querySelector("[role=menuitem]").focus();
    });
    document.addEventListener("click", (e) => { if (!menu.contains(e.target)) cerrarMenu(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarMenu(); });
    menu.querySelector("[data-ir]").addEventListener("click", (e) => { e.preventDefault(); cerrarMenu(); irA("configuracion"); });
    $("cerrarSesion").addEventListener("click", async () => {
      if (estado.sesionIniciada && !(await confirmar("Hay una sesión de terapia en curso. Si sales ahora no se guardará.", { titulo: "Cerrar sesión", aceptar: "Salir igualmente", peligro: true }))) return;
      try { await MotrixApi.post("/auth/logout", {}); } catch { /* sin conexión: igual se limpia */ }
      MotrixStorage.limpiarDatosLocales();
      localStorage.removeItem("motrix_usuario");
      location.href = "login.html?salida=1";
    });
  }

  /* =============================== Paciente =============================== */
  function cargarPaciente() {
    const p = MotrixStorage.obtenerPacienteActivo();
    estado.paciente = p || null;
    if (!p) {
      el.pacienteNombre.textContent = "Sin paciente activo";
      el.pacienteNombreMini.textContent = "ninguno";
      el.pacienteId.textContent = "Selecciónalo en Pacientes";
      ["pacienteEdad", "pacienteBrazo", "pacienteTerapia"].forEach((k) => { el[k].textContent = "—"; });
      el.pacienteAvatar.textContent = "·";
      el.progresoSub.textContent = "Elige un paciente para empezar";
      return;
    }
    el.pacienteNombre.textContent = p.nombre;
    el.pacienteNombreMini.textContent = p.nombre;
    el.pacienteId.textContent = `ID: ${String(p.id).slice(0, 8)}…`;
    el.pacienteId.title = p.id;
    el.pacienteEdad.textContent = p.edad ?? "—";
    el.pacienteBrazo.textContent = p.brazo || "—";
    el.pacienteTerapia.textContent = p.terapia || "—";
    el.pacienteAvatar.textContent = obtenerIniciales(p.nombre);
    el.progresoSub.textContent = `Duración objetivo: ${p.duracionMin || 20} min`;
  }
  const actualizarPacienteDashboard = cargarPaciente;

  /* ============================== Dispositivos ============================== */
  async function cargarDispositivos() {
    const datos = await MotrixApi.get("/dispositivos");
    estado.dispositivos = datos.dispositivos;
    estado.broker = datos.broker;
    const guardado = MotrixStorage.obtenerDispositivoActivo();
    const opciones = datos.dispositivos.length
      ? datos.dispositivos
      : [{ codigo: "", topicBase: datos.topicBasePredeterminado, nombre: `Tópico ${datos.topicBasePredeterminado} (sin registrar)` }];
    el.selector.innerHTML = opciones.map((d) => `<option value="${esc(d.codigo)}">${d.codigo ? (d.enLinea ? "● " : "○ ") : ""}${esc(d.nombre)}</option>`).join("");
    const elegido = opciones.find((d) => d.codigo === guardado) || opciones[0];
    el.selector.value = elegido.codigo;
    if (!estado.dispositivo || estado.dispositivo.topicBase !== elegido.topicBase) seleccionarDispositivo(elegido);
    else estado.dispositivo = elegido;
    return datos;
  }

  function seleccionarDispositivo(d) {
    estado.dispositivo = d;
    MotrixStorage.guardarDispositivoActivo(d.codigo);
    el.topicEmgLabel.textContent = `motrix/${d.topicBase}/emg`;
    marcarEsp32Offline(true);
    MotrixCharts.limpiar();
    MotrixMQTT.conectar(d.topicBase);
  }

  /* ========================= Telemetría en tiempo real ========================= */
  function iniciarTiempoReal() {
    MotrixMQTT.on("onConnect", () => {
      actualizarChip(el.chipMqtt, true);
      actualizarEstadoBloque(el.iconMqtt, el.txtMqtt, true, "Conectado");
      agregarActividad("Servidor conectado al broker MQTT.", "ok");
    });
    MotrixMQTT.on("onDisconnect", () => {
      actualizarChip(el.chipMqtt, false);
      actualizarEstadoBloque(el.iconMqtt, el.txtMqtt, false, "Desconectado");
      marcarEsp32Offline(true);
    });
    MotrixMQTT.on("onError", (err) => {
      if (/MQTT_URL/.test(err.message)) {
        actualizarEstadoBloque(el.iconMqtt, el.txtMqtt, false, "Sin configurar");
        $("controlesAyuda").textContent = "El servidor no tiene configurado el broker MQTT (ver .env).";
      } else if (err.status !== 401) {
        mostrarToast(err.message, "danger");
      }
    });
    MotrixMQTT.on("onMessage", manejarMensaje);
  }

  function setMetrica(nodo, html, trendId, texto) {
    nodo.innerHTML = html;
    const t = $(trendId);
    if (t && texto) t.textContent = texto;
  }

  function manejarMensaje(clave, payload) {
    marcarEsp32Online();
    const valor = parseFloat(payload);
    const s = estado.stats;
    switch (clave) {
      case "emg":
        if (!Number.isNaN(valor)) MotrixCharts.agregarPuntoEmg(valor, estado.ultimoRms);
        break;
      case "rms":
        if (Number.isNaN(valor)) break;
        estado.ultimoRms = valor;
        setMetrica(el.metricRms, `${valor.toFixed(2)}<span class="unit">mV</span>`, "trendRms", s ? `Promedio de la sesión: ${(s.rmsSuma / Math.max(1, s.rmsN + 1)).toFixed(1)}` : "Valor actual");
        if (s && !estado.pausada) { s.rmsSuma += valor; s.rmsN += 1; }
        break;
      case "angulo":
        if (Number.isNaN(valor)) break;
        setMetrica(el.metricAngulo, `${Math.round(valor)}<span class="unit">°</span>`, "trendAngulo", "Valor actual");
        if (s && !estado.pausada) { s.anguloSuma += valor; s.anguloN += 1; }
        break;
      case "repeticiones": {
        const reps = parseInt(payload, 10);
        if (Number.isNaN(reps)) break;
        el.metricReps.textContent = reps;
        $("trendReps").textContent = `Meta: ${estado.repeticionesMeta}`;
        actualizarProgresoSesion(reps);
        if (s) s.repeticiones = reps;
        if (reps > 0 && reps % 5 === 0) agregarActividad(`${reps} repeticiones completadas.`, "ok");
        break;
      }
      case "fuerza":
        if (Number.isNaN(valor)) break;
        setMetrica(el.metricFuerza, `${valor.toFixed(1)}<span class="unit">N</span>`, "trendFuerza", s ? `Máxima: ${Math.max(s.fuerzaMax, valor).toFixed(1)} N` : "Estimada a partir del EMG");
        if (s) s.fuerzaMax = Math.max(s.fuerzaMax, valor);
        break;
      case "temperatura":
        if (Number.isNaN(valor)) break;
        setMetrica(el.metricTemp, `${valor.toFixed(1)}<span class="unit">°C</span>`, "trendTemp", "Valor actual");
        if (s) { s.tempSuma += valor; s.tempN += 1; }
        break;
      case "bateria":
        if (Number.isNaN(valor)) break;
        setMetrica(el.metricBateria, `${Math.round(valor)}<span class="unit">%</span>`, "trendBateria", "Valor actual");
        break;
      case "rssi":
        if (!Number.isNaN(valor)) actualizarCalidadSenal(valor);
        break;
      case "estado":
        agregarActividad(`Equipo: ${payload}.`, "ok");
        // La ESP32 cierra sola la sesión al terminar el tiempo programado.
        if (/sesion finalizada/i.test(payload) && estado.sesionIniciada) {
          finalizarSesion({ enviarStop: false, motivo: "La ESP32 finalizó la sesión por tiempo." });
        }
        break;
      default: break;
    }
  }

  function actualizarChip(chipEl, activo) {
    const dot = chipEl?.querySelector(".dot");
    if (!dot) return;
    dot.classList.toggle("bad", !activo);
    dot.classList.remove("warn");
  }
  function actualizarEstadoBloque(iconEl, txtEl, activo, texto) {
    if (iconEl) iconEl.classList.toggle("off", !activo);
    if (txtEl) txtEl.textContent = texto;
  }

  let timeoutEsp32Offline = null;
  function marcarEsp32Online() {
    if (estado.ultimoEstadoEsp32 !== "online") {
      estado.ultimoEstadoEsp32 = "online";
      actualizarChip(el.chipEsp32, true);
      actualizarEstadoBloque(el.iconEsp32, el.txtEsp32, true, "Conectado");
      el.miniDeviceDot.classList.remove("offline");
      el.miniDeviceText.textContent = `${estado.dispositivo?.nombre || "ESP32"} en línea`;
      agregarActividad("Equipo en línea, enviando telemetría.", "ok");
    }
    clearTimeout(timeoutEsp32Offline);
    timeoutEsp32Offline = setTimeout(() => marcarEsp32Offline(), 8000);
  }
  function marcarEsp32Offline(silencioso) {
    const estaba = estado.ultimoEstadoEsp32 === "online";
    estado.ultimoEstadoEsp32 = "offline";
    actualizarChip(el.chipEsp32, false);
    actualizarEstadoBloque(el.iconEsp32, el.txtEsp32, false, "Sin señal");
    el.miniDeviceDot.classList.add("offline");
    el.miniDeviceText.textContent = `${estado.dispositivo?.nombre || "ESP32"} sin señal`;
    if (estaba && !silencioso) agregarActividad("No llegan datos del equipo desde hace 8 s.", "warn");
  }

  function actualizarCalidadSenal(rssiDbm) {
    el.signalDbm.textContent = `RSSI: ${Math.round(rssiDbm)} dBm`;
    let calidad = "Débil", nivel = 1;
    if (rssiDbm >= -60) { calidad = "Excelente"; nivel = 4; }
    else if (rssiDbm >= -70) { calidad = "Buena"; nivel = 3; }
    else if (rssiDbm >= -80) { calidad = "Regular"; nivel = 2; }
    el.txtSignalQuality.textContent = calidad;
    el.signalBars.querySelectorAll(".bar").forEach((b, i) => {
      b.style.background = i < nivel ? "var(--motrix-turquoise)" : "var(--border-soft)";
    });
  }

  function inicializarEstadoInternet() {
    const set = (on) => actualizarEstadoBloque(el.iconInternet, el.txtInternet, on, on ? "Estable" : "Sin conexión");
    set(navigator.onLine);
    window.addEventListener("online", () => set(true));
    window.addEventListener("offline", () => set(false));
  }

  /* ============================ Progreso y reloj ============================ */
  function actualizarProgresoSesion(reps) {
    const pct = Math.min(100, Math.round((reps / estado.repeticionesMeta) * 100));
    el.ringProgress.style.strokeDashoffset = RING_CIRCUNFERENCIA - (pct / 100) * RING_CIRCUNFERENCIA;
    el.ringLabel.textContent = `${pct}%`;
  }
  function duracionSegundos() {
    const corriendo = estado.tiempoInicio ? Date.now() - estado.tiempoInicio : 0;
    return Math.floor((estado.acumuladoMs + corriendo) / 1000);
  }
  function iniciarCronometro() {
    estado.tiempoInicio = Date.now();
    clearInterval(estado.intervaloSesion);
    estado.intervaloSesion = setInterval(() => { el.tiempoSesion.textContent = formatearSeg(duracionSegundos()); }, 1000);
  }
  function pausarCronometro() {
    if (estado.tiempoInicio) estado.acumuladoMs += Date.now() - estado.tiempoInicio;
    estado.tiempoInicio = null;
    clearInterval(estado.intervaloSesion);
  }
  function iniciarReloj() {
    const act = () => { el.reloj.textContent = new Date().toLocaleTimeString("es-BO", { hour12: false }); };
    act(); setInterval(act, 1000);
  }

  /* ============================ Actividad reciente ============================ */
  function agregarActividad(texto, tipo = "ok") {
    if (!el.activityList) return;
    const item = document.createElement("div");
    item.className = "activity-item";
    const dotClass = tipo === "ok" ? "turq" : tipo === "warn" ? "warn" : "";
    item.innerHTML = `<div class="activity-item__dot ${dotClass}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg></div>
      <div class="activity-item__text"><div class="a-title">${esc(texto)}</div><div class="a-time">${new Date().toLocaleTimeString("es-BO", { hour12: false })}</div></div>`;
    el.activityList.prepend(item);
    while (el.activityList.children.length > 25) el.activityList.removeChild(el.activityList.lastChild);
  }

  /* ========================= Controles de la sesión ========================= */
  function nuevaEstadistica() {
    return { rmsSuma: 0, rmsN: 0, anguloSuma: 0, anguloN: 0, tempSuma: 0, tempN: 0, fuerzaMax: 0, repeticiones: 0 };
  }

  function actualizarBotones() {
    el.btnStart.disabled = estado.sesionIniciada;
    el.btnPause.disabled = !estado.sesionIniciada;
    el.btnStop.disabled = !estado.sesionIniciada;
    el.btnCalibrate.disabled = estado.sesionIniciada;
    el.btnPause.lastChild.textContent = estado.pausada ? " Reanudar" : " Pausar";
  }

  async function iniciarSesion() {
    if (!estado.paciente) {
      mostrarToast("Selecciona un paciente en el módulo Pacientes antes de iniciar.", "warn");
      return irA("pacientes");
    }
    if (estado.ultimoEstadoEsp32 !== "online") {
      const seguir = await confirmar("No llegan datos del equipo seleccionado. Si está apagado o sin red, no recibirá el comando.", { titulo: "Equipo sin señal", aceptar: "Enviar de todos modos" });
      if (!seguir) return;
    }
    const terapia = estado.paciente.terapia || "Flexión";
    const ok = await MotrixMQTT.iniciar(terapia, Number(estado.paciente.duracionMin) || undefined);
    if (!ok) return;
    estado.sesionIniciada = true;
    estado.pausada = false;
    estado.acumuladoMs = 0;
    estado.stats = nuevaEstadistica();
    el.metricReps.textContent = "0";
    actualizarProgresoSesion(0);
    iniciarCronometro();
    actualizarBotones();
    agregarActividad(`Sesión iniciada (${terapia}).`, "ok");
    mostrarToast(`Terapia iniciada: ${terapia}`, "success");
  }

  async function alternarPausa() {
    if (!estado.sesionIniciada) return;
    if (!estado.pausada) {
      if (!(await MotrixMQTT.pausar())) return;
      estado.pausada = true;
      pausarCronometro();
      agregarActividad("Sesión pausada.", "warn");
    } else {
      if (!(await MotrixMQTT.reanudar())) return;
      estado.pausada = false;
      iniciarCronometro();
      agregarActividad("Sesión reanudada.", "ok");
    }
    actualizarBotones();
  }

  async function finalizarSesion({ enviarStop = true, motivo } = {}) {
    if (!estado.sesionIniciada || estado.guardando) return;
    // Se marca antes de enviar "stop": la ESP32 responde "Sesion finalizada"
    // casi de inmediato y eso no debe disparar un segundo guardado.
    estado.guardando = true;
    if (enviarStop && !(await MotrixMQTT.detener())) { estado.guardando = false; return; }
    pausarCronometro();
    const s = estado.stats || nuevaEstadistica();
    const datos = {
      pacienteId: estado.paciente?.id,
      terapia: estado.paciente?.terapia || null,
      duracionSeg: duracionSegundos(),
      repeticiones: s.repeticiones || parseInt(el.metricReps.textContent, 10) || 0,
      rmsPromedio: s.rmsN ? +(s.rmsSuma / s.rmsN).toFixed(3) : 0,
      anguloPromedio: s.anguloN ? +(s.anguloSuma / s.anguloN).toFixed(2) : 0,
      fuerzaMaxima: +s.fuerzaMax.toFixed(2),
      temperaturaPromedio: s.tempN ? +(s.tempSuma / s.tempN).toFixed(2) : 0,
      dispositivoId: estado.dispositivo?.id ?? null,
    };
    try {
      const guardada = await MotrixApi.post("/sesiones", datos);
      MotrixStorage.guardarSesiones([guardada, ...MotrixStorage.obtenerSesiones().filter((x) => x.id !== guardada.id)].slice(0, 50));
      agregarActividad("Sesión guardada en la base de datos.", "ok");
      mostrarToast(motivo ? `${motivo} Sesión guardada.` : "Sesión finalizada y guardada.", "success");
    } catch (error) {
      console.error("Error guardando la sesión:", error);
      MotrixStorage.guardarSesion({ ...datos, pacienteNombre: estado.paciente?.nombre });
      mostrarToast(`No se pudo guardar en el servidor (${error.message}). Quedó una copia en este navegador.`, "danger");
    } finally {
      estado.sesionIniciada = false;
      estado.pausada = false;
      estado.guardando = false;
      estado.stats = null;
      estado.acumuladoMs = 0;
      actualizarBotones();
    }
  }

  function configurarControles() {
    el.btnStart.addEventListener("click", iniciarSesion);
    el.btnPause.addEventListener("click", alternarPausa);
    el.btnStop.addEventListener("click", () => finalizarSesion());
    el.btnCalibrate.addEventListener("click", async () => {
      if (await MotrixMQTT.calibrar()) {
        agregarActividad("Comando de calibración enviado.", "ok");
        mostrarToast("Calibrando el equipo…", "success");
      }
    });
    el.btnConfig.addEventListener("click", () => irA("dispositivos"));
    el.selector.addEventListener("change", async () => {
      if (estado.sesionIniciada) {
        mostrarToast("Finaliza la sesión en curso antes de cambiar de equipo.", "warn");
        el.selector.value = estado.dispositivo.codigo;
        return;
      }
      const d = estado.dispositivos.find((x) => x.codigo === el.selector.value);
      if (d) seleccionarDispositivo(d);
    });
    window.addEventListener("beforeunload", (e) => { if (estado.sesionIniciada) { e.preventDefault(); e.returnValue = ""; } });
    actualizarBotones();
  }

  /* =============================== Navegación =============================== */
  function obtenerEstadoSesion() {
    const s = estado.stats;
    return {
      iniciada: estado.sesionIniciada,
      pausada: estado.pausada,
      duracionSeg: duracionSegundos(),
      repeticiones: parseInt(el.metricReps.textContent, 10) || 0,
      rms: s && s.rmsN ? s.rmsSuma / s.rmsN : (estado.ultimoRms || 0),
      angulo: s && s.anguloN ? s.anguloSuma / s.anguloN : 0,
      fuerza: s ? s.fuerzaMax : 0,
    };
  }
  function obtenerEstadoDispositivo() {
    const n = (node) => { const v = parseFloat(node?.textContent || ""); return Number.isFinite(v) ? v : null; };
    const rssi = (el.signalDbm?.textContent || "").match(/-?\d+/);
    return {
      online: estado.ultimoEstadoEsp32 === "online",
      mqtt: MotrixMQTT.estaConectado(),
      bateria: n(el.metricBateria), temp: n(el.metricTemp), rssi: rssi ? Number(rssi[0]) : null,
      dispositivo: estado.dispositivo,
    };
  }

  const helpers = {
    esc, toast: mostrarToast, confirmar, formatearSeg, formatearFecha, hace, obtenerIniciales,
    obtenerEstadoSesion, obtenerEstadoDispositivo, actualizarPacienteDashboard,
    get usuario() { return estado.usuario; },
    get esAdmin() { return estado.usuario?.rol === "ADMIN"; },
    recargarDispositivos: cargarDispositivos,
    irA: (v) => irA(v),
    iniciar: () => { irA("dashboard"); iniciarSesion(); },
    pausar: alternarPausa,
    finalizar: () => finalizarSesion(),
  };

  function cambiarVista(vista) {
    if (!TITULOS[vista]) vista = "resumen";
    if (vista === "usuarios" && !helpers.esAdmin) vista = "resumen";
    estado.vistaActual = vista;
    document.querySelectorAll(".nav-item").forEach((i) => {
      const activa = i.dataset.view === vista;
      i.classList.toggle("active", activa);
      if (activa) i.setAttribute("aria-current", "page"); else i.removeAttribute("aria-current");
    });
    el.tituloVista.textContent = TITULOS[vista];
    document.title = `${TITULOS[vista]} — MOTRIX`;
    if (vista === "dashboard") {
      el.dashboardContent.classList.remove("hidden");
      el.moduleContainer.classList.add("hidden");
      el.moduleContainer.innerHTML = "";
      return;
    }
    el.dashboardContent.classList.add("hidden");
    el.moduleContainer.classList.remove("hidden");
    // Cada vista recibe su propio contenedor: si una carga asíncrona termina
    // después de cambiar de vista, escribe en un nodo ya retirado del DOM.
    const host = document.createElement("div");
    host.innerHTML = `<div class="module-view"><div class="empty-state">Cargando…</div></div>`;
    el.moduleContainer.replaceChildren(host);
    const view = window.MotrixViews?.[vista];
    if (typeof view === "function") view(host, helpers);
    else mostrarToast("No se encontró el módulo solicitado", "danger");
  }

  function irA(vista) {
    const hash = vista === "dashboard" ? "#monitor" : `#${vista}`;
    if (location.hash !== hash) location.hash = hash; else cambiarVista(vista);
  }
  function vistaDesdeHash() {
    const h = location.hash.replace("#", "");
    return h === "monitor" ? "dashboard" : (h || "resumen");
  }

  function configurarSidebar() {
    const abrir = () => { el.sidebar.classList.add("open"); el.sidebarOverlay.classList.add("open"); };
    const cerrar = () => { el.sidebar.classList.remove("open"); el.sidebarOverlay.classList.remove("open"); };
    el.menuBtn.addEventListener("click", abrir);
    el.sidebarOverlay.addEventListener("click", cerrar);
    document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", cerrar));
    window.addEventListener("hashchange", () => cambiarVista(vistaDesdeHash()));
  }

  function configurarControlesGrafica() {
    el.chartTools.forEach((btn) => btn.addEventListener("click", () => {
      el.chartTools.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      MotrixCharts.setRango(btn.dataset.range);
    }));
    el.btnClearChart?.addEventListener("click", () => { MotrixCharts.limpiar(); mostrarToast("Gráfica reiniciada", "success"); });
  }

  /* ============================== Inicialización ============================== */
  async function init() {
    try {
      await cargarUsuario();
    } catch (e) {
      if (e.status !== 401) document.body.innerHTML = `<main style="padding:40px;font-family:sans-serif"><h1>No se pudo conectar con el servidor</h1><p>${esc(e.message)}</p></main>`;
      return;
    }
    document.body.classList.remove("cargando-sesion");
    estado.repeticionesMeta = Number(MotrixStorage.obtenerConfiguracion().metaRepeticiones) || 30;
    $("trendReps").textContent = `Meta: ${estado.repeticionesMeta}`;
    configurarMenuUsuario();
    cargarPaciente();
    iniciarReloj();
    inicializarEstadoInternet();
    MotrixCharts.init();
    configurarControles();
    configurarSidebar();
    configurarControlesGrafica();
    iniciarTiempoReal();
    cambiarVista(vistaDesdeHash());
    try { await cargarDispositivos(); } catch (e) { mostrarToast(e.message, "danger"); }
    // Actualiza el estado de los equipos en el selector cada 20 s.
    setInterval(() => { if (!estado.sesionIniciada) cargarDispositivos().catch(() => {}); }, 20000);
    agregarActividad("Panel MOTRIX inicializado.", "ok");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
