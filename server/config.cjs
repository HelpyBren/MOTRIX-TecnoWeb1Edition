/* ======================================================================
   MOTRIX — Configuración central
   Todas las opciones sensibles llegan desde variables de entorno (.env).
   Ver .env.example para la descripción de cada variable.
   ====================================================================== */
"use strict";

const path = require("path");
require("dotenv").config({ path: process.env.DOTENV_PATH || path.join(__dirname, "..", ".env") });

const ROOT = path.join(__dirname, "..");

function bool(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "si", "sí", "on"].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const env = process.env.NODE_ENV || "development";
const isProd = env === "production";

const config = {
  root: ROOT,
  env,
  isProd,
  port: int(process.env.PORT, 3000),
  appUrl: (process.env.APP_URL || `http://localhost:${int(process.env.PORT, 3000)}`).replace(/\/$/, ""),
  timezone: process.env.APP_TIMEZONE || "America/La_Paz",
  trustProxy: bool(process.env.TRUST_PROXY, false),

  databaseUrl: process.env.DATABASE_URL || "file:./dev.db",

  auth: {
    cookieName: "motrix_sid",
    sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 12),
    cookieSecure: process.env.COOKIE_SECURE ? bool(process.env.COOKIE_SECURE) : isProd,
    allowSelfSignup: bool(process.env.ALLOW_SELF_SIGNUP, false),
    resetTtlMinutes: int(process.env.RESET_TOKEN_TTL_MINUTES, 30),
    maxFailedLogins: int(process.env.MAX_FAILED_LOGINS, 5),
    lockMinutes: int(process.env.LOCK_MINUTES, 15),
  },

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "MOTRIX <no-reply@motrix.local>",
  },

  mqtt: {
    // Conexión del SERVIDOR al broker (HiveMQ Cloud: mqtts://<host>:8883).
    url: process.env.MQTT_URL || "",
    username: process.env.MQTT_USERNAME || "",
    password: process.env.MQTT_PASSWORD || "",
    // Prefijo de tópicos por defecto (motrix/<topicBase>/...). Coincide con el firmware.
    defaultTopicBase: process.env.MQTT_TOPIC_BASE || "paciente1",
    // Segundos sin latido para considerar un dispositivo desconectado.
    offlineAfterSec: int(process.env.DEVICE_OFFLINE_AFTER_SEC, 15),
  },

  // Clave maestra para derivar la clave de cada ESP32 (firma de comandos).
  deviceMasterKey: process.env.DEVICE_MASTER_KEY || "",
};

config.mqtt.enabled = Boolean(config.mqtt.url);
config.smtp.enabled = Boolean(config.smtp.host);

function validate() {
  const warnings = [];
  if (!config.deviceMasterKey || config.deviceMasterKey.length < 32) {
    warnings.push("DEVICE_MASTER_KEY no está definido (mín. 32 caracteres): el cambio remoto de WiFi quedará deshabilitado.");
  }
  if (!config.mqtt.enabled) {
    warnings.push("MQTT_URL no está definido: el monitor en vivo y el estado de las ESP32 no estarán disponibles.");
  }
  if (!config.smtp.enabled) {
    warnings.push(isProd
      ? "SMTP no configurado: la recuperación de contraseña por correo no funcionará (un administrador puede generar enlaces)."
      : "SMTP no configurado: en desarrollo los enlaces de recuperación se muestran en esta consola.");
  }
  if (isProd && !config.appUrl.startsWith("https://")) {
    warnings.push("APP_URL no usa HTTPS en producción. Las cookies seguras requieren HTTPS.");
  }
  return warnings;
}

config.validate = validate;
module.exports = config;
