/* ======================================================================
   MOTRIX — Registro de auditoría (inicios de sesión, exportaciones,
   cambios de usuarios y de dispositivos). Nunca se registran contraseñas.
   ====================================================================== */
"use strict";

const { prisma } = require("../db.cjs");
const { clientIp } = require("../utils/http.cjs");

async function audit(req, accion, detalle, usuarioId) {
  try {
    await prisma.auditoria.create({
      data: {
        accion,
        detalle: detalle ? String(typeof detalle === "string" ? detalle : JSON.stringify(detalle)).slice(0, 1000) : null,
        usuarioId: usuarioId || req?.user?.id || null,
        ip: req ? clientIp(req) || null : null,
      },
    });
  } catch (e) {
    console.error("[auditoría] No se pudo registrar:", e.message);
  }
}

module.exports = { audit };
