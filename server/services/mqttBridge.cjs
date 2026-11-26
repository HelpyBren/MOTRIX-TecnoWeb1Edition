/* ======================================================================
   MOTRIX — Puente MQTT del servidor
   ----------------------------------------------------------------------
   El servidor se conecta a HiveMQ Cloud con sus propias credenciales
   (.env) y:
     1. Reenvía la telemetría de la ESP32 al navegador por SSE
        (/api/tiempo-real/stream). Las credenciales del broker ya no
        viajan al navegador.
     2. Publica los comandos de terapia (start/stop/velocidad/calibrar)
        solo para usuarios autenticados.
     3. Mantiene el estado de conexión de cada ESP32 en la tabla
        Dispositivo (latido rssi + estado retenido con LWT).
     4. Publica comandos firmados de configuración WiFi.

   Tópicos existentes (sin cambios, compatibles con el firmware original):
     motrix/<topicBase>/{emg,rms,angulo,repeticiones,estado,fuerza,
                         temperatura,bateria,rssi}        ESP32 → web
     motrix/<topicBase>/{start,stop,velocidad,calibrar}   web → ESP32
   Tópicos nuevos (firmware v2):
     motrix/dispositivos/<codigo>/estado   JSON retenido + LWT
     motrix/dispositivos/<codigo>/cmd      comandos firmados
     motrix/dispositivos/<codigo>/wifi     resultado del cambio de red
   ====================================================================== */
"use strict";

const EventEmitter = require("events");
const crypto = require("crypto");
const config = require("../config.cjs");
const { prisma } = require("../db.cjs");

const TELEMETRIA = ["emg", "rms", "angulo", "repeticiones", "estado", "fuerza", "temperatura", "bateria", "rssi"];
const COMANDOS = ["start", "stop", "velocidad", "calibrar"];
const TOPIC_RE = /^[A-Za-z0-9_-]{1,40}$/;

class MqttBridge extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
    this.client = null;
    this.conectado = false;
    this.ultimoError = null;
    this.latidos = new Map();       // topicBase → { ts, rssi }
    this.estados = new Map();       // codigo → { online, ts, ...payload }
    this.escrituraDb = new Map();   // clave → ts última escritura (limita escrituras)
  }

  get habilitado() { return config.mqtt.enabled; }

  iniciar(opciones = {}) {
    if (!this.habilitado && !opciones.url) {
      console.warn("[MQTT] Puente deshabilitado: define MQTT_URL, MQTT_USERNAME y MQTT_PASSWORD en .env");
      return;
    }
    const mqtt = require("mqtt");
    const url = opciones.url || config.mqtt.url;
    this.client = mqtt.connect(url, {
      username: opciones.username ?? (config.mqtt.username || undefined),
      password: opciones.password ?? (config.mqtt.password || undefined),
      clientId: `motrix-server-${crypto.randomBytes(4).toString("hex")}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    this.client.on("connect", () => {
      this.conectado = true;
      this.ultimoError = null;
      console.log(`[MQTT] Conectado al broker ${url.replace(/\/\/.*@/, "//")}`);
      this.client.subscribe(["motrix/+/+", "motrix/dispositivos/+/estado", "motrix/dispositivos/+/wifi"], { qos: 0 });
      this.emit("broker", { conectado: true });
    });
    this.client.on("close", () => {
      if (this.conectado) this.emit("broker", { conectado: false });
      this.conectado = false;
    });
    this.client.on("error", (err) => {
      this.ultimoError = err.message;
      console.error("[MQTT] Error:", err.message);
    });
    this.client.on("message", (topic, buf) => this.procesar(topic, buf.toString()).catch((e) => {
      console.error("[MQTT] Error procesando mensaje:", e.message);
    }));
  }

  detener() {
    return new Promise((resolve) => (this.client ? this.client.end(true, {}, resolve) : resolve()));
  }

  estadoBroker() {
    return { habilitado: this.habilitado || !!this.client, conectado: this.conectado, error: this.ultimoError };
  }

  async procesar(topic, payload) {
    const partes = topic.split("/");
    if (partes[0] !== "motrix") return;

    if (partes[1] === "dispositivos" && partes.length === 4) {
      const codigo = partes[2];
      if (partes[3] === "estado") return this.procesarEstado(codigo, payload);
      if (partes[3] === "wifi") return this.procesarResultadoWifi(codigo, payload);
      return;
    }
    if (partes.length !== 3) return;
    const [, topicBase, clave] = partes;
    if (!TELEMETRIA.includes(clave)) return; // ignora los comandos que publicamos nosotros
    this.emit("telemetria", { topicBase, clave, valor: payload, ts: Date.now() });

    if (clave === "rssi" || clave === "emg") {
      const anterior = this.latidos.get(topicBase) || {};
      const rssi = clave === "rssi" ? Number.parseInt(payload, 10) : anterior.rssi;
      this.latidos.set(topicBase, { ts: Date.now(), rssi: Number.isFinite(rssi) ? rssi : anterior.rssi });
      if (this.debeEscribir(`hb:${topicBase}`, 10000)) {
        await prisma.dispositivo.updateMany({
          where: { topicBase },
          data: { ultimaConexion: new Date(), estado: "Conectado", ...(Number.isFinite(rssi) ? { ultimoRssi: rssi } : {}) },
        });
      }
    }
  }

  async procesarEstado(codigo, payload) {
    let datos;
    try { datos = JSON.parse(payload); } catch { return; }
    const online = datos.online !== false;
    this.estados.set(codigo, { ...datos, online, ts: Date.now() });
    this.emit("dispositivo", { codigo, online });
    const data = {
      estado: online ? "Conectado" : "Desconectado",
      ...(online ? { ultimaConexion: new Date() } : {}),
    };
    if (online) {
      if (typeof datos.ip === "string") data.ip = datos.ip.slice(0, 45);
      if (typeof datos.ssid === "string") data.ssid = datos.ssid.slice(0, 32);
      if (typeof datos.mac === "string") data.mac = datos.mac.slice(0, 17);
      if (typeof datos.fw === "string") data.firmware = datos.fw.slice(0, 20);
      if (Number.isFinite(Number(datos.rssi))) data.ultimoRssi = Math.round(Number(datos.rssi));
    }
    await prisma.dispositivo.updateMany({ where: { codigo }, data });
  }

  async procesarResultadoWifi(codigo, payload) {
    let datos;
    try { datos = JSON.parse(payload); } catch { return; }
    const ok = datos.ok === true;
    const mensaje = String(datos.msg || (ok ? "Conectado a la nueva red" : "No se pudo conectar")).slice(0, 200);
    await prisma.dispositivo.updateMany({
      where: { codigo },
      data: {
        wifiEstado: ok ? "ok" : "error",
        wifiMensaje: mensaje,
        wifiActualizadoEn: new Date(),
        ...(ok && typeof datos.ssid === "string" ? { ssid: datos.ssid.slice(0, 32) } : {}),
      },
    });
    this.emit("wifi", { codigo, ok, mensaje });
  }

  debeEscribir(clave, intervaloMs) {
    const ahora = Date.now();
    if (ahora - (this.escrituraDb.get(clave) || 0) < intervaloMs) return false;
    this.escrituraDb.set(clave, ahora);
    return true;
  }

  /** Estado en línea calculado a partir del latido y del estado retenido. */
  enLinea(dispositivo) {
    const limite = config.mqtt.offlineAfterSec * 1000;
    const est = this.estados.get(dispositivo.codigo);
    if (est && est.online === false && Date.now() - est.ts < limite * 4) {
      const hb = this.latidos.get(dispositivo.topicBase);
      if (!hb || hb.ts < est.ts) return false;
    }
    const hb = this.latidos.get(dispositivo.topicBase);
    const ultimo = Math.max(hb?.ts || 0, est?.online ? est.ts : 0, dispositivo.ultimaConexion ? new Date(dispositivo.ultimaConexion).getTime() : 0);
    return Date.now() - ultimo < limite;
  }

  latido(topicBase) { return this.latidos.get(topicBase) || null; }

  /** Dispositivos que publican estado pero no están registrados en la base. */
  detectados(codigosRegistrados) {
    const out = [];
    for (const [codigo, est] of this.estados) {
      if (!codigosRegistrados.has(codigo) && est.online) {
        out.push({ codigo, topicBase: est.topic || null, ip: est.ip || null, fw: est.fw || null, visto: est.ts });
      }
    }
    return out;
  }

  publicar(topic, mensaje, opciones = { qos: 1, retain: false }) {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.conectado) return reject(new Error("El servidor no está conectado al broker MQTT."));
      this.client.publish(topic, mensaje, opciones, (err) => (err ? reject(err) : resolve()));
    });
  }

  comandoTerapia(topicBase, accion, valor) {
    if (!TOPIC_RE.test(topicBase)) throw new Error("Tópico no válido");
    if (!COMANDOS.includes(accion)) throw new Error("Comando no válido");
    return this.publicar(`motrix/${topicBase}/${accion}`, String(valor), { qos: 0, retain: false });
  }

  comandoDispositivo(codigo, comando) {
    return this.publicar(`motrix/dispositivos/${codigo}/cmd`, JSON.stringify(comando), { qos: 1, retain: false });
  }
}

const bridge = new MqttBridge();
module.exports = { bridge, MqttBridge, TELEMETRIA, COMANDOS, TOPIC_RE };
