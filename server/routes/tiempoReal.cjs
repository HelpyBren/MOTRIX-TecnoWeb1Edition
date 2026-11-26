/* ======================================================================
   MOTRIX — /api/tiempo-real
   GET  /stream?topicBase=paciente1  → Server-Sent Events con la telemetría
   POST /comando                      → start | stop | velocidad | calibrar
   El navegador ya no necesita las credenciales del broker MQTT.
   ====================================================================== */
"use strict";

const express = require("express");
const config = require("../config.cjs");
const { prisma } = require("../db.cjs");
const { asyncHandler, HttpError } = require("../utils/http.cjs");
const { bridge, TOPIC_RE } = require("../services/mqttBridge.cjs");
const { audit } = require("../services/audit.cjs");
const { rateLimit } = require("../middleware/rateLimit.cjs");

const router = express.Router();
const TERAPIAS = ["flexion", "extension", "pronacion", "supinacion"];

async function validarTopic(topicBase) {
  const t = String(topicBase || config.mqtt.defaultTopicBase);
  if (!TOPIC_RE.test(t)) throw new HttpError(400, "Tópico no válido.");
  if (t === config.mqtt.defaultTopicBase) return t;
  const existe = await prisma.dispositivo.findFirst({ where: { topicBase: t } });
  if (!existe) throw new HttpError(404, "No hay un dispositivo registrado con ese tópico.");
  return t;
}

router.get("/stream", asyncHandler(async (req, res) => {
  const topicBase = await validarTopic(req.query.topicBase);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const enviar = (evento, datos) => res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
  enviar("broker", bridge.estadoBroker());

  const onTelemetria = (m) => { if (m.topicBase === topicBase) enviar("t", { k: m.clave, v: m.valor, ts: m.ts }); };
  const onBroker = (e) => enviar("broker", { ...bridge.estadoBroker(), ...e });
  bridge.on("telemetria", onTelemetria);
  bridge.on("broker", onBroker);
  const latido = setInterval(() => res.write(": ping\n\n"), 15000);

  req.on("close", () => {
    clearInterval(latido);
    bridge.off("telemetria", onTelemetria);
    bridge.off("broker", onBroker);
  });
}));

router.post("/comando", rateLimit({ windowMs: 60 * 1000, max: 60 }), asyncHandler(async (req, res) => {
  const topicBase = await validarTopic(req.body?.topicBase);
  const accion = String(req.body?.accion || "");
  let valor;
  switch (accion) {
    case "start": {
      const terapia = String(req.body?.terapia || "");
      if (!TERAPIAS.includes(terapia)) throw new HttpError(400, "Tipo de terapia no válido.");
      const minutos = Number(req.body?.minutos);
      // Formato compatible: "flexion" (firmware original) o "flexion|20" (firmware v2: duración en minutos).
      valor = Number.isInteger(minutos) && minutos >= 1 && minutos <= 120 ? `${terapia}|${minutos}` : terapia;
      break;
    }
    case "stop":
    case "calibrar":
      valor = "1";
      break;
    case "velocidad": {
      const v = Number(req.body?.valor);
      if (!Number.isInteger(v) || v < 0 || v > 20000) throw new HttpError(400, "Velocidad no válida.");
      valor = String(v);
      break;
    }
    default:
      throw new HttpError(400, "Comando no válido.");
  }
  if (!bridge.conectado) throw new HttpError(503, "El servidor no está conectado al broker MQTT.");
  await bridge.comandoTerapia(topicBase, accion, valor);
  if (accion !== "velocidad") await audit(req, `comando_${accion}`, { topicBase, valor });
  res.json({ ok: true });
}));

module.exports = router;
