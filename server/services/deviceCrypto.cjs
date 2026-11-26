/* ======================================================================
   MOTRIX — Firma y cifrado de comandos para la ESP32
   ----------------------------------------------------------------------
   * Cada ESP32 tiene una clave propia de 32 bytes:
       claveDispositivo = HMAC-SHA256(DEVICE_MASTER_KEY, "motrix-device:" + codigo)
     El servidor la recalcula cuando la necesita (no se guarda en la base)
     y el administrador la copia una sola vez en firmware/config.h.
   * Comando = JSON { a, c, s, p, n, t, h }
       a: acción ("wifi" | "portal" | "reiniciar")
       c: código del dispositivo        s: SSID (solo "wifi")
       p: contraseña WiFi cifrada (hex) n: nonce aleatorio (hex, 16 bytes)
       t: marca de tiempo UNIX (s)      h: HMAC-SHA256 (hex)
   * Cifrado de la contraseña: XOR con flujo de bytes
       bloque_i = HMAC-SHA256(clave, "enc|" + n + "|" + i)
   * Firma: h = HMAC-SHA256(clave, a|c|s|p|n|t)
   La ESP32 verifica la firma, la ventana de tiempo (±5 min, hora NTP) y
   que el nonce no se haya usado; solo entonces descifra y aplica.
   La contraseña WiFi nunca se guarda en la base ni en los registros.
   ====================================================================== */
"use strict";

const crypto = require("crypto");
const config = require("../config.cjs");

function disponible() {
  return Boolean(config.deviceMasterKey && config.deviceMasterKey.length >= 32);
}

function claveDispositivo(codigo, masterKey = config.deviceMasterKey) {
  if (!masterKey || masterKey.length < 32) throw new Error("DEVICE_MASTER_KEY no configurada");
  return crypto.createHmac("sha256", masterKey).update(`motrix-device:${codigo}`).digest();
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function flujo(key, nonceHex, length) {
  const out = Buffer.alloc(length);
  let offset = 0;
  for (let i = 0; offset < length; i++) {
    const bloque = hmac(key, `enc|${nonceHex}|${i}`);
    bloque.copy(out, offset, 0, Math.min(bloque.length, length - offset));
    offset += bloque.length;
  }
  return out;
}

function cifrar(key, nonceHex, texto) {
  const datos = Buffer.from(String(texto), "utf8");
  const ks = flujo(key, nonceHex, datos.length);
  for (let i = 0; i < datos.length; i++) datos[i] ^= ks[i];
  return datos.toString("hex");
}

function descifrar(key, nonceHex, hex) {
  const datos = Buffer.from(hex, "hex");
  const ks = flujo(key, nonceHex, datos.length);
  for (let i = 0; i < datos.length; i++) datos[i] ^= ks[i];
  return datos.toString("utf8");
}

function mensajeFirma({ a, c, s = "", p = "", n, t }) {
  return [a, c, s, p, n, String(t)].join("|");
}

/** Construye un comando firmado listo para publicar por MQTT. */
function crearComando(codigo, accion, { ssid, password } = {}, opciones = {}) {
  const key = opciones.key || claveDispositivo(codigo);
  const n = opciones.nonce || crypto.randomBytes(16).toString("hex");
  const t = opciones.t || Math.floor(Date.now() / 1000);
  const cmd = { a: accion, c: codigo, s: "", p: "", n, t };
  if (accion === "wifi") {
    cmd.s = String(ssid);
    cmd.p = password ? cifrar(key, n, password) : "";
  }
  cmd.h = hmac(key, mensajeFirma(cmd)).toString("hex");
  return cmd;
}

/** Verificación (la usa el simulador de pruebas; la ESP32 hace lo mismo en C++). */
function verificarComando(cmd, key, { ahora = Math.floor(Date.now() / 1000), ventana = 300 } = {}) {
  const esperado = hmac(key, mensajeFirma(cmd));
  const recibido = Buffer.from(String(cmd.h || ""), "hex");
  if (recibido.length !== esperado.length || !crypto.timingSafeEqual(recibido, esperado)) return { ok: false, motivo: "firma" };
  if (Math.abs(ahora - Number(cmd.t)) > ventana) return { ok: false, motivo: "tiempo" };
  return { ok: true, password: cmd.p ? descifrar(key, cmd.n, cmd.p) : "" };
}

module.exports = { disponible, claveDispositivo, crearComando, verificarComando, cifrar, descifrar, mensajeFirma };
