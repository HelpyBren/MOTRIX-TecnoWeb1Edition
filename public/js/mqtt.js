/* ======================================================================
   MOTRIX — mqtt.js (v2)
   ----------------------------------------------------------------------
   Antes: el navegador se conectaba directamente a HiveMQ Cloud con el
   usuario y la contraseña del broker escritos en este archivo (visibles
   para cualquier visitante).
   Ahora: el servidor mantiene la conexión MQTT y reenvía la telemetría
   por Server-Sent Events. Los comandos se envían por la API y solo los
   pueden emitir usuarios autenticados.

   Se conserva la misma API pública (MotrixMQTT.on / conectar / iniciar /
   detener / pausar / calibrar / setVelocidad / estaConectado), por lo que
   ui.js y los módulos siguen funcionando igual.
   Los tópicos MQTT de la ESP32 no cambian: motrix/<topicBase>/<clave>.
   ====================================================================== */

function construirTopicos(topicBase) {
  const base = `motrix/${topicBase}`;
  return {
    emg: `${base}/emg`, rms: `${base}/rms`, angulo: `${base}/angulo`,
    repeticiones: `${base}/repeticiones`, estado: `${base}/estado`, fuerza: `${base}/fuerza`,
    temperatura: `${base}/temperatura`, bateria: `${base}/bateria`, rssi: `${base}/rssi`,
    cmdStart: `${base}/start`, cmdStop: `${base}/stop`, cmdVelocidad: `${base}/velocidad`, cmdCalibrar: `${base}/calibrar`,
  };
}

const MotrixMQTT = (function () {
  "use strict";

  const TERAPIAS = { "Flexión": "flexion", "Extensión": "extension", "Pronación": "pronacion", "Supinación": "supinacion" };
  let fuente = null;
  let topicBase = null;
  let brokerConectado = false;
  const listeners = { onConnect: [], onDisconnect: [], onMessage: [], onError: [] };

  function emit(evento, ...args) {
    (listeners[evento] || []).forEach((cb) => {
      try { cb(...args); } catch (err) { console.error(`Error en listener de ${evento}:`, err); }
    });
  }

  function conectar(nuevoTopic) {
    desconectar();
    topicBase = nuevoTopic;
    if (!topicBase) return;
    fuente = new EventSource(`/api/tiempo-real/stream?topicBase=${encodeURIComponent(topicBase)}`, { withCredentials: true });

    fuente.addEventListener("broker", (ev) => {
      const datos = JSON.parse(ev.data);
      const antes = brokerConectado;
      brokerConectado = !!datos.conectado;
      if (brokerConectado && !antes) emit("onConnect", datos);
      if (!brokerConectado && antes) emit("onDisconnect", datos);
      if (!brokerConectado && !datos.habilitado) emit("onError", new Error("El servidor no tiene configurado MQTT (MQTT_URL en .env)."));
    });
    fuente.addEventListener("t", (ev) => {
      const { k, v } = JSON.parse(ev.data);
      emit("onMessage", k, v, `motrix/${topicBase}/${k}`);
    });
    fuente.onerror = () => {
      // EventSource reintenta solo; avisamos de la desconexión temporal.
      if (brokerConectado) { brokerConectado = false; emit("onDisconnect", { conectado: false }); }
    };
  }

  function desconectar() {
    if (fuente) { fuente.close(); fuente = null; }
    if (brokerConectado) { brokerConectado = false; emit("onDisconnect", { conectado: false }); }
  }

  async function comando(accion, extra = {}) {
    if (!topicBase) { emit("onError", new Error("Selecciona un equipo")); return false; }
    try {
      await MotrixApi.post("/tiempo-real/comando", { topicBase, accion, ...extra });
      return true;
    } catch (err) {
      emit("onError", err);
      return false;
    }
  }

  const normalizarTerapia = (valor) => TERAPIAS[valor] || "flexion";

  return {
    conectar,
    desconectar,
    iniciar: (tipoTerapia, minutos) => comando("start", { terapia: normalizarTerapia(tipoTerapia), ...(minutos ? { minutos } : {}) }),
    detener: () => comando("stop"),
    pausar: () => comando("velocidad", { valor: 0 }),
    reanudar: (retardoUs = 1000) => comando("velocidad", { valor: retardoUs }),
    calibrar: () => comando("calibrar"),
    setVelocidad: (valor) => comando("velocidad", { valor: Number(valor) }),
    estaConectado: () => brokerConectado,
    on(evento, cb) { (listeners[evento] = listeners[evento] || []).push(cb); },
    get topicBase() { return topicBase; },
    get topics() { return topicBase ? construirTopicos(topicBase) : {}; },
  };
})();
