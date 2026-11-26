#!/usr/bin/env node
/* ======================================================================
   MOTRIX — Simulador de ESP32 (solo pruebas, sin hardware)
   Publica los mismos tópicos que el firmware v2 y responde a los
   comandos de terapia y a los comandos firmados de WiFi, verificando la
   firma con la misma lógica que la ESP32.
   ⚠ Los datos son sintéticos. No lo uses con pacientes reales: las
   sesiones que guardes mientras está activo quedarán en la base.

   Uso:
     node tools/simulador-esp32.js --url mqtt://localhost:1883 \
          --codigo MOTRIX-01 --topic paciente1 --clave <DEVICE_KEY hex>
   ====================================================================== */
"use strict";
const mqtt = require("mqtt");
const { verificarComando } = require("../server/services/deviceCrypto");

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const url = arg("url", "mqtt://localhost:1883");
const codigo = arg("codigo", "MOTRIX-01");
const topic = arg("topic", "paciente1");
const clave = Buffer.from(arg("clave", ""), "hex");
const base = `motrix/${topic}`;
const estadoTopic = `motrix/dispositivos/${codigo}/estado`;
let ssid = arg("ssid", "Red-Consultorio");
let sesion = null;
const nonces = [];

const client = mqtt.connect(url, {
  clientId: `sim-${codigo}`,
  username: arg("user"), password: arg("pass"),
  will: { topic: estadoTopic, payload: JSON.stringify({ online: false }), retain: true, qos: 1 },
});

function publicarEstado() {
  client.publish(estadoTopic, JSON.stringify({ online: true, fw: "2.0.0-sim", ip: "192.168.1.50", ssid, rssi: -58, mac: "24:6F:28:AA:BB:CC", topic }), { retain: true, qos: 1 });
}

client.on("connect", () => {
  console.log(`[sim] conectado a ${url} como ${codigo} (tópico ${base})`);
  client.subscribe([`${base}/start`, `${base}/stop`, `${base}/velocidad`, `${base}/calibrar`, `motrix/dispositivos/${codigo}/cmd`]);
  client.publish(`${base}/estado`, "ESP32 (motores) conectada y lista");
  publicarEstado();
});

client.on("message", (t, buf) => {
  const msg = buf.toString();
  if (t === `${base}/start`) {
    const [terapia, min] = msg.split("|");
    sesion = { terapia, reps: 0, pausado: false, fin: Date.now() + (Number(min) || 5) * 60000 };
    client.publish(`${base}/repeticiones`, "0");
    client.publish(`${base}/estado`, "Sesion iniciada");
    console.log(`[sim] start ${terapia} (${min || 5} min)`);
  } else if (t === `${base}/stop`) {
    if (sesion) client.publish(`${base}/estado`, "Sesion finalizada");
    sesion = null;
  } else if (t === `${base}/velocidad`) {
    if (sesion) sesion.pausado = msg === "0";
  } else if (t === `${base}/calibrar`) {
    client.publish(`${base}/estado`, "Calibracion completa");
  } else if (t.endsWith("/cmd")) {
    let cmd; try { cmd = JSON.parse(msg); } catch { return; }
    const r = verificarComando(cmd, clave);
    if (!r.ok || cmd.c !== codigo || nonces.includes(cmd.n)) { console.log(`[sim] comando rechazado (${r.motivo || "nonce/código"})`); return; }
    nonces.push(cmd.n); if (nonces.length > 8) nonces.shift();
    if (cmd.a === "wifi") {
      console.log(`[sim] cambio de WiFi verificado → ssid="${cmd.s}", contraseña de ${r.password.length} caracteres (descifrada correctamente)`);
      setTimeout(() => {
        const ok = r.password !== "fallar123";
        if (ok) ssid = cmd.s;
        client.publish(`motrix/dispositivos/${codigo}/wifi`, JSON.stringify({ ok, ssid: cmd.s, msg: ok ? `Conectado a ${cmd.s}` : "Contraseña incorrecta; se restauró la red anterior" }));
        publicarEstado();
      }, 2500);
    } else console.log(`[sim] comando ${cmd.a} verificado`);
  }
});

// Telemetría: ~10 muestras/s de EMG (envolvente sintética) y latido RSSI cada 4 s.
let t0 = Date.now();
setInterval(() => {
  if (!client.connected) return;
  const t = (Date.now() - t0) / 1000;
  const activo = sesion && !sesion.pausado;
  const env = activo ? 120 + 90 * Math.max(0, Math.sin(t * 1.3)) + Math.random() * 25 : 8 + Math.random() * 5;
  const v = env.toFixed(1);
  client.publish(`${base}/emg`, v);
  client.publish(`${base}/rms`, v);
  client.publish(`${base}/fuerza`, Math.min(10, (env / 300) * 10).toFixed(1));
  if (activo && Math.random() < 0.025) { sesion.reps += 1; client.publish(`${base}/repeticiones`, String(sesion.reps)); }
  if (sesion && Date.now() > sesion.fin) { client.publish(`${base}/estado`, "Sesion finalizada"); sesion = null; }
}, 100);
setInterval(() => client.connected && client.publish(`${base}/rssi`, String(-55 - Math.round(Math.random() * 8))), 4000);
setInterval(() => client.connected && publicarEstado(), 30000);
