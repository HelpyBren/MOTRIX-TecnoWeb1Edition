/* ======================================================================
   MOTRIX — app.js
   Almacenamiento local de pacientes, sesiones y configuración.
   Compatible con el antiguo motrix_paciente para no perder datos.
   ====================================================================== */
(function () {
  "use strict";

  const PACIENTES_KEY = "motrix_pacientes";
  const PACIENTE_ACTIVO_KEY = "motrix_paciente_activo";
  const SESIONES_KEY = "motrix_sesiones";
  const CONFIG_KEY = "motrix_configuracion";
  const OLD_KEY = "motrix_paciente";
  const DISPOSITIVO_KEY = "motrix_dispositivo_activo";

  function generarIdPaciente() {
    let id;
    do {
      const num = Math.floor(100000 + Math.random() * 900000);
      id = `MTX-${num}`;
    } while (obtenerPacientes().some(p => p.id === id));
    return id;
  }

  function leerArray(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value : [];
    } catch (err) {
      console.error(`Error leyendo ${key}:`, err);
      return [];
    }
  }

  function guardarArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function migrarPacienteAntiguo() {
    const actuales = leerArray(PACIENTES_KEY);
    if (actuales.length) return actuales;

    try {
      const raw = localStorage.getItem(OLD_KEY);
      if (!raw) return [];
      const antiguo = JSON.parse(raw);
      if (!antiguo || !antiguo.nombre) return [];

      const paciente = {
        ...antiguo,
        id: antiguo.id || generarIdPaciente(),
        creadoEn: antiguo.creadoEn || new Date().toISOString(),
      };
      guardarArray(PACIENTES_KEY, [paciente]);
      localStorage.setItem(PACIENTE_ACTIVO_KEY, paciente.id);
      return [paciente];
    } catch (err) {
      console.error("Error migrando paciente antiguo:", err);
      return [];
    }
  }

  function obtenerPacientes() {
    return migrarPacienteAntiguo();
  }

  function guardarPacientes(pacientes) {
    guardarArray(PACIENTES_KEY, pacientes);
  }

  function agregarPaciente(datos) {
    const paciente = {
      id: generarIdPaciente(),
      nombre: datos.nombre,
      edad: Number(datos.edad),
      sexo: datos.sexo || "",
      brazo: datos.brazo || "",
      terapia: datos.terapia || "",
      duracionMin: Number(datos.duracionMin || 20),
      observaciones: datos.observaciones || "",
      creadoEn: new Date().toISOString(),
    };
    const pacientes = obtenerPacientes();
    pacientes.push(paciente);
    guardarPacientes(pacientes);
    return paciente;
  }

  function actualizarPaciente(id, cambios) {
    const pacientes = obtenerPacientes();
    const index = pacientes.findIndex(p => p.id === id);
    if (index === -1) return null;
    pacientes[index] = { ...pacientes[index], ...cambios };
    guardarPacientes(pacientes);
    return pacientes[index];
  }

  function eliminarPaciente(id) {
    const pacientes = obtenerPacientes().filter(p => p.id !== id);
    guardarPacientes(pacientes);
    if (obtenerPacienteActivo()?.id === id) {
      localStorage.removeItem(PACIENTE_ACTIVO_KEY);
    }
    return pacientes;
  }

  function seleccionarPaciente(id) {
    const paciente = obtenerPacientes().find(p => p.id === id);
    if (!paciente) return null;
    localStorage.setItem(PACIENTE_ACTIVO_KEY, id);
    // Compatibilidad con código existente del Dashboard.
    localStorage.setItem(OLD_KEY, JSON.stringify(paciente));
    return paciente;
  }

  function obtenerPacienteActivo() {
    const pacientes = obtenerPacientes();
    const idActivo = localStorage.getItem(PACIENTE_ACTIVO_KEY);
    return pacientes.find(p => p.id === idActivo) || pacientes[0] || null;
  }

  function obtenerPaciente() {
    return obtenerPacienteActivo();
  }

  function obtenerSesiones() {
    return leerArray(SESIONES_KEY);
  }

  function guardarSesiones(sesiones) {
    guardarArray(SESIONES_KEY, sesiones);
  }

  function guardarSesion(datos) {
    const sesion = {
      id: `SES-${Date.now()}`,
      pacienteId: datos.pacienteId || obtenerPacienteActivo()?.id || "",
      pacienteNombre: datos.pacienteNombre || obtenerPacienteActivo()?.nombre || "Paciente",
      fecha: datos.fecha || new Date().toISOString(),
      terapia: datos.terapia || obtenerPacienteActivo()?.terapia || "",
      duracionSeg: Number(datos.duracionSeg || 0),
      repeticiones: Number(datos.repeticiones || 0),
      rmsPromedio: Number(datos.rmsPromedio || 0),
      anguloPromedio: Number(datos.anguloPromedio || 0),
      fuerzaMaxima: Number(datos.fuerzaMaxima || 0),
      temperaturaPromedio: Number(datos.temperaturaPromedio || 0),
    };
    const sesiones = obtenerSesiones();
    sesiones.unshift(sesion);
    guardarSesiones(sesiones);
    return sesion;
  }

  function obtenerConfiguracion() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : {
        fisioterapeuta: "Fisioterapeuta",
        correo: "",
        duracionPredeterminada: 20,
        metaRepeticiones: 30,
        broker: "HiveMQ Cloud",
        topicBase: "motrix/paciente1",
        mostrarActividad: true,
        mostrarDatosTiempoReal: true,
      };
    } catch {
      return {};
    }
  }

  function guardarConfiguracion(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return config;
  }

  /* ------------------------------------------------------------------
     REGISTRO.HTML — sigue funcionando, pero ahora agrega pacientes.
     ------------------------------------------------------------------ */
  const formRegistro = document.getElementById("formRegistro");

  if (formRegistro) {
    const inputDuracion = document.getElementById("duracion");
    const labelDuracion = document.getElementById("duracionVal");

    if (inputDuracion && labelDuracion) {
      const actualizarDuracion = () => {
        labelDuracion.textContent = `${inputDuracion.value} min`;
      };
      inputDuracion.addEventListener("input", actualizarDuracion);
      actualizarDuracion();
    }

    formRegistro.addEventListener("submit", async function (e) {
      e.preventDefault();
      limpiarErrores();

      const nombre = document.getElementById("nombre").value.trim();
      const edad = document.getElementById("edad").value.trim();
      const sexo = document.getElementById("sexo").value;
      const brazo = formRegistro.querySelector('input[name="brazo"]:checked');
      const terapia = formRegistro.querySelector('input[name="terapia"]:checked');
      const duracion = document.getElementById("duracion").value;
      const observaciones = document.getElementById("observaciones").value.trim();

      let valido = true;
      if (!nombre) { mostrarError("nombre", "Ingresa el nombre completo del paciente."); valido = false; }
      if (!edad || Number(edad) <= 0) { mostrarError("edad", "Ingresa una edad válida."); valido = false; }
      if (!sexo) { mostrarError("sexo", "Selecciona el sexo del paciente."); valido = false; }
      if (!brazo) { mostrarError("brazo", "Selecciona el brazo afectado."); valido = false; }
      if (!terapia) { mostrarError("terapia", "Selecciona el tipo de terapia."); valido = false; }
      if (!valido) return;

      const datosPaciente = {
        nombre, edad: Number(edad), sexo,
        brazo: brazo.value,
        terapia: terapia.value,
        duracionMin: Number(duracion),
        observaciones,
      };

      const boton = document.getElementById("btnIniciar");
      if (boton) boton.disabled = true;
      try {
        // Se guarda en SQLite a través de la API (requiere sesión iniciada).
        const resultado = await MotrixApi.post("/pacientes", datosPaciente);
        // Copia local mínima para que el monitor muestre al paciente activo.
        const pacientes = obtenerPacientes().filter(p => p.id !== resultado.id);
        pacientes.push(resultado);
        guardarPacientes(pacientes);
        seleccionarPaciente(resultado.id);
        window.location.href = "dashboard.html#monitor";
      } catch (error) {
        console.error("Error guardando paciente:", error);
        mostrarError("general", error.message || "No se pudo guardar el paciente.");
        if (boton) boton.disabled = false;
      }
    });

    function mostrarError(campo, mensaje) {
      const el = document.querySelector(`[data-error-for="${campo}"]`);
      if (el) el.textContent = mensaje;
    }

    function limpiarErrores() {
      document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
    }
  }

  /** Borra los datos clínicos guardados en este navegador (al cerrar sesión). */
  function limpiarDatosLocales() {
    [PACIENTES_KEY, PACIENTE_ACTIVO_KEY, SESIONES_KEY, OLD_KEY].forEach((k) => localStorage.removeItem(k));
  }

  function obtenerDispositivoActivo() { return localStorage.getItem(DISPOSITIVO_KEY); }
  function guardarDispositivoActivo(codigo) {
    if (codigo) localStorage.setItem(DISPOSITIVO_KEY, codigo); else localStorage.removeItem(DISPOSITIVO_KEY);
  }

  window.MotrixStorage = {
    limpiarDatosLocales,
    obtenerDispositivoActivo,
    guardarDispositivoActivo,
    KEYS: { PACIENTES_KEY, PACIENTE_ACTIVO_KEY, SESIONES_KEY, CONFIG_KEY },
    KEY: PACIENTES_KEY,
    generarIdPaciente,
    obtenerPacientes,
    guardarPacientes,
    agregarPaciente,
    actualizarPaciente,
    eliminarPaciente,
    seleccionarPaciente,
    obtenerPacienteActivo,
    obtenerPaciente,
    obtenerSesiones,
    guardarSesiones,
    guardarSesion,
    guardarConfiguracion,
    obtenerConfiguracion,
  };
})();
