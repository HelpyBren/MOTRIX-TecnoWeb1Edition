/* ======================================================================
   MOTRIX — mqtt.js
   Conexión MQTT sobre WebSockets a HiveMQ Cloud.
   La ESP32 publica telemetría y este cliente web se suscribe a ella;
   también publica comandos (start/stop/velocidad) hacia la ESP32.

   IMPORTANTE:
   Reemplaza las credenciales de MOTRIX_CONFIG con las de tu clúster
   de HiveMQ Cloud antes de desplegar en producción. Por seguridad,
   nunca subas credenciales reales a un repositorio público: en un
   entorno real estas deberían inyectarse desde el backend o desde
   variables de entorno servidas de forma segura.
   ====================================================================== */

/* ------------------------------------------------------------------
   CONFIGURACIÓN DEL BROKER
   ------------------------------------------------------------------ */
const MOTRIX_CONFIG = {
  // Host de tu clúster HiveMQ Cloud, sin protocolo. Ej: "xxxxxxx.s1.eu.hivemq.cloud"
  host: "53f6144e75454368b9a3b613ae0c8c80.s1.eu.hivemq.cloud",
  // Puerto estándar para MQTT sobre WebSockets seguro (WSS) en HiveMQ Cloud
  port: 8884,
  // Ruta WebSocket estándar de HiveMQ Cloud
  path: "/mqtt",
  // Usa TLS/WSS siempre en producción
  useTLS: true,
  // Credenciales del broker (usuario/rol con permisos de lectura y escritura)
  username: "Usuario",
  password: "12345678",
  // Identificador del paciente activo — determina el prefijo de los tópicos
  pacienteTopic: "paciente1",
};

/* ------------------------------------------------------------------
   TÓPICOS MQTT
   ------------------------------------------------------------------ */
function construirTopicos(pacienteId) {
  const base = `motrix/${pacienteId}`;
  return {
    emg: `${base}/emg`,
    rms: `${base}/rms`,
    angulo: `${base}/angulo`,
    repeticiones: `${base}/repeticiones`,
    estado: `${base}/estado`,
    fuerza: `${base}/fuerza`,
    // Tópicos adicionales de telemetría del dispositivo
    temperatura: `${base}/temperatura`,
    bateria: `${base}/bateria`,
    rssi: `${base}/rssi`,
    // Tópicos de comandos (dashboard -> ESP32)
    cmdStart: `${base}/start`,
    cmdStop: `${base}/stop`,
    cmdVelocidad: `${base}/velocidad`,
    cmdCalibrar: `${base}/calibrar`,
  };
}
 
/* ======================================================================
   CLIENTE MQTT — MotrixMQTT
   Envuelve mqtt.js y expone una API sencilla basada en callbacks
   para el resto del dashboard (ui.js, charts.js).
   ====================================================================== */
const MotrixMQTT = (function () {
  "use strict";
 
  let client = null;
  let topics = construirTopicos(MOTRIX_CONFIG.pacienteTopic);
  let reconnectAttempts = 0;
 
  // Callbacks registrados desde ui.js / charts.js
  const listeners = {
    onConnect: [],
    onDisconnect: [],
    onMessage: [], // (topicKey, payload, rawTopic) => {}
    onError: [],
  };
 
  function emit(event, ...args) {
    (listeners[event] || []).forEach((cb) => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`Error en listener de ${event}:`, err);
      }
    });
  }
 
  /* ------------------------------------------------------------------
     Conectar al broker HiveMQ Cloud vía MQTT sobre WebSockets (WSS)
     ------------------------------------------------------------------ */
  function conectar(pacienteId) {
    if (pacienteId) {
      MOTRIX_CONFIG.pacienteTopic = pacienteId;
      topics = construirTopicos(pacienteId);
    }
 
    const protocolo = MOTRIX_CONFIG.useTLS ? "wss" : "ws";
    const url = `${protocolo}://${MOTRIX_CONFIG.host}:${MOTRIX_CONFIG.port}${MOTRIX_CONFIG.path}`;
 
    const opciones = {
      clientId: `motrix_dashboard_${Math.random().toString(16).slice(2, 10)}`,
      username: MOTRIX_CONFIG.username,
      password: MOTRIX_CONFIG.password,
      clean: true,
      reconnectPeriod: 3000, // reintenta cada 3s si se pierde la conexión
      connectTimeout: 8000,
    };
 
    try {
      client = mqtt.connect(url, opciones);
    } catch (err) {
      console.error("No se pudo iniciar la conexión MQTT:", err);
      emit("onError", err);
      return;
    }
 
    client.on("connect", () => {
      reconnectAttempts = 0;
      console.log("[MOTRIX MQTT] Conectado a HiveMQ Cloud:", url);
 
      // Suscribirse a todos los tópicos de telemetría
      const topicosSuscripcion = [
        topics.emg,
        topics.rms,
        topics.angulo,
        topics.repeticiones,
        topics.estado,
        topics.fuerza,
        topics.temperatura,
        topics.bateria,
        topics.rssi,
      ];
 
      client.subscribe(topicosSuscripcion, { qos: 0 }, (err) => {
        if (err) {
          console.error("[MOTRIX MQTT] Error al suscribirse:", err);
          emit("onError", err);
        }
      });
 
      emit("onConnect");
    });
 
    client.on("reconnect", () => {
      reconnectAttempts += 1;
      console.warn(`[MOTRIX MQTT] Reintentando conexión (#${reconnectAttempts})…`);
    });
 
    client.on("close", () => {
      emit("onDisconnect");
    });
 
    client.on("offline", () => {
      emit("onDisconnect");
    });
 
    client.on("error", (err) => {
      console.error("[MOTRIX MQTT] Error de conexión:", err);
      emit("onError", err);
    });
 
    client.on("message", (rawTopic, payloadBuffer) => {
      const payload = payloadBuffer.toString();
      const topicKey = identificarTopico(rawTopic);
      emit("onMessage", topicKey, payload, rawTopic);
    });
  }
 
  /* ------------------------------------------------------------------
     Identifica a qué variable de telemetría corresponde un tópico
     ------------------------------------------------------------------ */
  function identificarTopico(rawTopic) {
    const entradas = Object.entries(topics);
    const encontrado = entradas.find(([, valor]) => valor === rawTopic);
    return encontrado ? encontrado[0] : "desconocido";
  }
 
  /* ------------------------------------------------------------------
     Publicar un comando hacia la ESP32
     ------------------------------------------------------------------ */
  function publicar(topicKey, mensaje) {
    if (!client || !client.connected) {
      console.warn("[MOTRIX MQTT] No conectado. No se pudo enviar:", topicKey, mensaje);
      emit("onError", new Error("Cliente MQTT no conectado"));
      return false;
    }
    const topic = topics[topicKey];
    if (!topic) {
      console.error("[MOTRIX MQTT] Tópico desconocido:", topicKey);
      return false;
    }
    client.publish(topic, String(mensaje), { qos: 0 });
    return true;
  }
 
  /* ------------------------------------------------------------------
     Normaliza el tipo de terapia (como lo guarda el formulario de
     registro, con tildes) a un código simple sin acentos que la
     ESP32 pueda comparar fácilmente en un switch/if de C++.
     ------------------------------------------------------------------ */
  function normalizarTerapia(valor) {
    const mapa = {
      "Flexión": "flexion",
      "Extensión": "extension",
      "Pronación": "pronacion",
      "Supinación": "supinacion",
    };
    return mapa[valor] || "flexion"; // valor por defecto si no coincide ninguno
  }
 
  /* ------------------------------------------------------------------
     API pública de comandos de alto nivel
     ------------------------------------------------------------------ */
  function iniciar(tipoTerapia) {
    const codigo = normalizarTerapia(tipoTerapia);
    return publicar("cmdStart", codigo);
  }
  function detener() {
    return publicar("cmdStop", "1");
  }
  function pausar() {
    // La ESP32 puede interpretar velocidad 0 como pausa lógica del motor
    return publicar("cmdVelocidad", "0");
  }
  function calibrar() {
    return publicar("cmdCalibrar", "1");
  }
  function setVelocidad(valor) {
    return publicar("cmdVelocidad", String(valor));
  }
 
  function desconectar() {
    if (client) {
      client.end(true);
      client = null;
    }
  }
 
  function estaConectado() {
    return !!(client && client.connected);
  }
 
  /* ------------------------------------------------------------------
     Registro de listeners externos
     ------------------------------------------------------------------ */
  function on(evento, callback) {
    if (!listeners[evento]) listeners[evento] = [];
    listeners[evento].push(callback);
  }
 
  return {
    conectar,
    desconectar,
    publicar,
    iniciar,
    detener,
    pausar,
    calibrar,
    setVelocidad,
    estaConectado,
    on,
    get topics() {
      return topics;
    },
  };
})();