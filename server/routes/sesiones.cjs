/* ======================================================================
   MOTRIX — /api/sesiones
   GET acepta los mismos filtros que la exportación a Excel.
   POST conserva el formato original y registra usuario y dispositivo.
   ====================================================================== */
"use strict";

const express = require("express");
const { randomUUID } = require("crypto");
const { prisma } = require("../db.cjs");
const { asyncHandler, HttpError, num } = require("../utils/http.cjs");
const { requireRole, ROLES } = require("../middleware/auth.cjs");
const { puedeVerPaciente } = require("../services/permisos.cjs");
const { construirFiltroSesiones } = require("../services/filtros.cjs");
const { audit } = require("../services/audit.cjs");

const router = express.Router();

const INCLUDE = {
  registradaPor: { select: { id: true, nombre: true } },
  dispositivo: { select: { id: true, nombre: true, codigo: true } },
};

router.get("/", asyncHandler(async (req, res) => {
  const { where } = construirFiltroSesiones(req.query, req.user);
  const limite = Math.min(Math.max(Number(req.query.limite) || 5000, 1), 20000);
  res.json(await prisma.sesion.findMany({ where, orderBy: { fecha: "desc" }, take: limite, include: INCLUDE }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.pacienteId) throw new HttpError(400, "El paciente es obligatorio para registrar una sesión.");

  const valores = {
    duracionSeg: Math.max(0, Math.round(num(b.duracionSeg, { field: "duracionSeg", min: 0, max: 86400 }))),
    repeticiones: Math.max(0, Math.round(num(b.repeticiones, { field: "repeticiones", min: 0, max: 100000 }))),
    rmsPromedio: num(b.rmsPromedio, { field: "rmsPromedio" }),
    anguloPromedio: num(b.anguloPromedio, { field: "anguloPromedio" }),
    fuerzaMaxima: num(b.fuerzaMaxima, { field: "fuerzaMaxima" }),
    temperaturaPromedio: num(b.temperaturaPromedio, { field: "temperaturaPromedio" }),
  };

  const paciente = await prisma.paciente.findUnique({ where: { id: String(b.pacienteId) } });
  if (!puedeVerPaciente(req.user, paciente)) {
    throw new HttpError(400, "El paciente no existe o no está asignado a tu cuenta.");
  }

  let dispositivoId = null;
  if (b.dispositivoId !== undefined && b.dispositivoId !== null && b.dispositivoId !== "") {
    const disp = await prisma.dispositivo.findUnique({ where: { id: Number(b.dispositivoId) } });
    if (!disp) throw new HttpError(400, "El dispositivo indicado no existe.");
    dispositivoId = disp.id;
  }

  const sesion = await prisma.sesion.create({
    data: {
      id: randomUUID(),
      pacienteId: paciente.id,
      pacienteNombre: paciente.nombre,
      terapia: (b.terapia ? String(b.terapia).slice(0, 60) : null) || paciente.terapia || null,
      ...valores,
      registradaPorId: req.user.id,
      dispositivoId,
    },
    include: INCLUDE,
  });
  await audit(req, "sesion_registrada", { id: sesion.id, pacienteId: paciente.id });
  res.status(201).json(sesion);
}));

router.delete("/:id", requireRole(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const s = await prisma.sesion.findUnique({ where: { id: req.params.id } });
  if (!s) throw new HttpError(404, "Sesión no encontrada.");
  await prisma.sesion.delete({ where: { id: s.id } });
  await audit(req, "sesion_eliminada", { id: s.id });
  res.json({ mensaje: "Sesión eliminada." });
}));

module.exports = router;
