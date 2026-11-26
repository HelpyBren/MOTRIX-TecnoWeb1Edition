/* ======================================================================
   MOTRIX — /api/dispositivos
   Registro de ESP32, estado de conexión y configuración WiFi remota.
   Lectura: cualquier usuario autenticado. Gestión: administradores.
   ====================================================================== */
"use strict";

const express = require("express");
const config = require("../config.cjs");
const { prisma } = require("../db.cjs");
const { asyncHandler, HttpError, str } = require("../utils/http.cjs");
const { requireRole, isAdmin, ROLES } = require("../middleware/auth.cjs");
const { verifyPassword } = require("../utils/security.cjs");
const { bridge, TOPIC_RE } = require("../services/mqttBridge.cjs");
const deviceCrypto = require("../services/deviceCrypto.cjs");
const { audit } = require("../services/audit.cjs");
const { rateLimit } = require("../middleware/rateLimit.cjs");

const router = express.Router();
const soloAdmin = requireRole(ROLES.ADMIN);
const CODIGO_RE = /^[A-Za-z0-9_-]{3,40}$/;

function serializar(d, user) {
  const hb = bridge.latido(d.topicBase);
  const base = {
    id: d.id, nombre: d.nombre, codigo: d.codigo, topicBase: d.topicBase,
    descripcion: d.descripcion, ubicacion: d.ubicacion, creadoEn: d.creadoEn,
    enLinea: bridge.enLinea(d),
    ultimaConexion: hb && (!d.ultimaConexion || hb.ts > new Date(d.ultimaConexion).getTime()) ? new Date(hb.ts) : d.ultimaConexion,
    ultimoRssi: hb?.rssi ?? d.ultimoRssi,
    firmware: d.firmware, ssid: d.ssid,
    wifiEstado: d.wifiEstado, wifiMensaje: d.wifiMensaje, wifiActualizadoEn: d.wifiActualizadoEn,
    sesiones: d._count?.sesiones ?? undefined,
  };
  // Datos de red internos solo para administradores.
  if (isAdmin(user)) Object.assign(base, { ip: d.ip, mac: d.mac });
  return base;
}

function leerDatos(body = {}) {
  const nombre = str(body.nombre, { required: true, max: 80, field: "nombre" });
  const codigo = String(body.codigo || "").trim();
  if (!CODIGO_RE.test(codigo)) throw new HttpError(400, "El código debe tener 3 a 40 caracteres (letras, números, - o _). Debe coincidir con DEVICE_ID del firmware.");
  const topicBase = String(body.topicBase || config.mqtt.defaultTopicBase).trim();
  if (!TOPIC_RE.test(topicBase)) throw new HttpError(400, "El tópico base solo admite letras, números, - o _ (ej. paciente1).");
  return {
    nombre, codigo, topicBase,
    descripcion: str(body.descripcion, { max: 300, field: "descripción" }),
    ubicacion: str(body.ubicacion, { max: 120, field: "ubicación" }),
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const lista = await prisma.dispositivo.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { sesiones: true } } } });
  const respuesta = {
    dispositivos: lista.map((d) => serializar(d, req.user)),
    broker: bridge.estadoBroker(),
    firmaDisponible: deviceCrypto.disponible(),
    topicBasePredeterminado: config.mqtt.defaultTopicBase,
  };
  if (isAdmin(req.user)) respuesta.detectados = bridge.detectados(new Set(lista.map((d) => d.codigo)));
  res.json(respuesta);
}));

router.post("/", soloAdmin, asyncHandler(async (req, res) => {
  const datos = leerDatos(req.body);
  if (await prisma.dispositivo.findUnique({ where: { codigo: datos.codigo } })) throw new HttpError(409, "Ya existe un dispositivo con ese código.");
  const d = await prisma.dispositivo.create({ data: datos });
  await audit(req, "dispositivo_creado", { codigo: d.codigo });
  res.status(201).json(serializar(d, req.user));
}));

router.put("/:id", soloAdmin, asyncHandler(async (req, res) => {
  const actual = await prisma.dispositivo.findUnique({ where: { id: Number(req.params.id) } });
  if (!actual) throw new HttpError(404, "Dispositivo no encontrado.");
  const datos = leerDatos(req.body);
  const otro = await prisma.dispositivo.findUnique({ where: { codigo: datos.codigo } });
  if (otro && otro.id !== actual.id) throw new HttpError(409, "Ya existe un dispositivo con ese código.");
  const d = await prisma.dispositivo.update({ where: { id: actual.id }, data: datos });
  await audit(req, "dispositivo_actualizado", { codigo: d.codigo });
  res.json(serializar(d, req.user));
}));

router.delete("/:id", soloAdmin, asyncHandler(async (req, res) => {
  const actual = await prisma.dispositivo.findUnique({ where: { id: Number(req.params.id) } });
  if (!actual) throw new HttpError(404, "Dispositivo no encontrado.");
  await prisma.dispositivo.delete({ where: { id: actual.id } });
  await audit(req, "dispositivo_eliminado", { codigo: actual.codigo });
  res.json({ mensaje: "Dispositivo eliminado. Las sesiones históricas se conservan." });
}));

/** Muestra la clave del dispositivo para copiarla en firmware/config.h. Pide la contraseña del administrador. */
router.post("/:id/clave", soloAdmin, rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), asyncHandler(async (req, res) => {
  if (!deviceCrypto.disponible()) throw new HttpError(503, "Configura DEVICE_MASTER_KEY en .env para generar claves de dispositivo.");
  if (!(await verifyPassword(String(req.body?.password || ""), req.user.passwordHash))) {
    throw new HttpError(400, "Contraseña incorrecta.");
  }
  const d = await prisma.dispositivo.findUnique({ where: { id: Number(req.params.id) } });
  if (!d) throw new HttpError(404, "Dispositivo no encontrado.");
  const clave = deviceCrypto.claveDispositivo(d.codigo).toString("hex");
  await audit(req, "clave_dispositivo_consultada", { codigo: d.codigo });
  res.json({
    codigo: d.codigo,
    topicBase: d.topicBase,
    clave,
    snippet: [
      `#define DEVICE_ID   "${d.codigo}"`,
      `#define TOPIC_BASE  "${d.topicBase}"`,
      `#define DEVICE_KEY  "${clave}"`,
    ].join("\n"),
  });
}));

const limiteWifi = rateLimit({ windowMs: 10 * 60 * 1000, max: 10 });

async function obtenerParaComando(id) {
  if (!deviceCrypto.disponible()) throw new HttpError(503, "El cambio remoto requiere DEVICE_MASTER_KEY en el servidor.");
  if (!bridge.conectado) throw new HttpError(503, "El servidor no está conectado al broker MQTT.");
  const d = await prisma.dispositivo.findUnique({ where: { id: Number(id) } });
  if (!d) throw new HttpError(404, "Dispositivo no encontrado.");
  if (!bridge.enLinea(d)) throw new HttpError(409, "El dispositivo no está en línea. Usa la configuración local (punto de acceso MOTRIX).");
  return d;
}

/** Cambio de red remoto: la ESP32 prueba la red nueva y, si falla, vuelve a la anterior. */
router.post("/:id/wifi", soloAdmin, limiteWifi, asyncHandler(async (req, res) => {
  const ssid = String(req.body?.ssid ?? "");
  const password = String(req.body?.password ?? "");
  if (!ssid.trim() || Buffer.byteLength(ssid, "utf8") > 32) throw new HttpError(400, "El nombre de red (SSID) debe tener entre 1 y 32 bytes.");
  const plen = Buffer.byteLength(password, "utf8");
  if (plen !== 0 && (plen < 8 || plen > 63)) throw new HttpError(400, "La contraseña WPA/WPA2 debe tener entre 8 y 63 caracteres (o dejarse vacía para redes abiertas).");
  const d = await obtenerParaComando(req.params.id);

  const cmd = deviceCrypto.crearComando(d.codigo, "wifi", { ssid, password });
  await bridge.comandoDispositivo(d.codigo, cmd);
  await prisma.dispositivo.update({
    where: { id: d.id },
    data: { wifiEstado: "pendiente", wifiMensaje: `Solicitud enviada para conectar a "${ssid}"`, wifiActualizadoEn: new Date() },
  });
  // Se audita la red solicitada, nunca la contraseña.
  await audit(req, "wifi_cambio_solicitado", { codigo: d.codigo, ssid });
  res.status(202).json({ mensaje: "Comando enviado. La ESP32 probará la nueva red y, si falla, volverá a la anterior." });
}));

router.post("/:id/portal", soloAdmin, limiteWifi, asyncHandler(async (req, res) => {
  const d = await obtenerParaComando(req.params.id);
  await bridge.comandoDispositivo(d.codigo, deviceCrypto.crearComando(d.codigo, "portal"));
  await audit(req, "wifi_portal_solicitado", { codigo: d.codigo });
  res.status(202).json({ mensaje: "La ESP32 abrirá su punto de acceso de configuración. La clave aparecerá en su pantalla LCD." });
}));

router.post("/:id/reiniciar", soloAdmin, limiteWifi, asyncHandler(async (req, res) => {
  const d = await obtenerParaComando(req.params.id);
  await bridge.comandoDispositivo(d.codigo, deviceCrypto.crearComando(d.codigo, "reiniciar"));
  await audit(req, "dispositivo_reinicio_solicitado", { codigo: d.codigo });
  res.status(202).json({ mensaje: "Reinicio solicitado." });
}));

module.exports = router;
