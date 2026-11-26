/* ======================================================================
   MOTRIX — /api/pacientes
   Conserva los endpoints originales (GET, POST, PUT, DELETE) y añade
   control de acceso por rol y responsable.
   ====================================================================== */
"use strict";

const express = require("express");
const { randomUUID } = require("crypto");
const { prisma } = require("../db.cjs");
const { asyncHandler, HttpError, str, intIn } = require("../utils/http.cjs");
const { requireRole, isAdmin, ROLES } = require("../middleware/auth.cjs");
const { pacienteWhere, puedeVerPaciente } = require("../services/permisos.cjs");
const { audit } = require("../services/audit.cjs");

const router = express.Router();

const INCLUDE = { responsable: { select: { id: true, nombre: true } }, _count: { select: { sesiones: true } } };

function leerDatos(body = {}) {
  const nombre = str(body.nombre, { required: true, max: 120, field: "nombre" });
  const edad = Number(body.edad);
  if (!Number.isInteger(edad) || edad < 1 || edad > 120) {
    throw new HttpError(400, "El nombre y una edad válida (1 a 120) son obligatorios");
  }
  return {
    nombre,
    edad,
    sexo: str(body.sexo, { max: 30, field: "sexo" }),
    brazo: str(body.brazo, { max: 30, field: "brazo" }),
    terapia: str(body.terapia, { max: 60, field: "terapia" }),
    duracionMin: intIn(body.duracionMin, { min: 1, max: 240, field: "La duración", fallback: 20 }),
    observaciones: str(body.observaciones, { max: 2000, field: "observaciones" }),
  };
}

async function resolverResponsable(req, solicitado) {
  if (!isAdmin(req.user)) return req.user.id;
  if (solicitado === undefined) return undefined; // sin cambios
  if (!solicitado) return null;
  const u = await prisma.usuario.findUnique({ where: { id: String(solicitado) } });
  if (!u) throw new HttpError(400, "El responsable indicado no existe.");
  return u.id;
}

router.get("/", asyncHandler(async (req, res) => {
  const where = { ...pacienteWhere(req.user) };
  if (isAdmin(req.user) && req.query.responsableId === "ninguno") where.responsableId = null;
  else if (isAdmin(req.user) && req.query.responsableId) where.responsableId = String(req.query.responsableId);
  res.json(await prisma.paciente.findMany({ where, orderBy: { creadoEn: "desc" }, include: INCLUDE }));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const p = await prisma.paciente.findUnique({ where: { id: req.params.id }, include: INCLUDE });
  if (!puedeVerPaciente(req.user, p)) throw new HttpError(404, "Paciente no encontrado");
  res.json(p);
}));

router.post("/", asyncHandler(async (req, res) => {
  const datos = leerDatos(req.body);
  const responsableId = await resolverResponsable(req, req.body?.responsableId);
  const paciente = await prisma.paciente.create({
    data: { id: randomUUID(), ...datos, responsableId: responsableId === undefined ? req.user.id : responsableId },
    include: INCLUDE,
  });
  await audit(req, "paciente_creado", { id: paciente.id });
  res.status(201).json(paciente);
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const actual = await prisma.paciente.findUnique({ where: { id: req.params.id } });
  if (!puedeVerPaciente(req.user, actual)) throw new HttpError(404, "Paciente no encontrado");
  const datos = leerDatos(req.body);
  const responsableId = await resolverResponsable(req, req.body?.responsableId);
  const paciente = await prisma.paciente.update({
    where: { id: actual.id },
    data: { ...datos, ...(isAdmin(req.user) && responsableId !== undefined ? { responsableId } : {}) },
    include: INCLUDE,
  });
  // Mantiene coherente el nombre desnormalizado en las sesiones del paciente.
  if (actual.nombre !== paciente.nombre) {
    await prisma.sesion.updateMany({ where: { pacienteId: paciente.id }, data: { pacienteNombre: paciente.nombre } });
  }
  await audit(req, "paciente_actualizado", { id: paciente.id });
  res.json(paciente);
}));

router.delete("/:id", requireRole(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const actual = await prisma.paciente.findUnique({ where: { id: req.params.id } });
  if (!actual) throw new HttpError(404, "Paciente no encontrado");
  await prisma.paciente.delete({ where: { id: actual.id } });
  await audit(req, "paciente_eliminado", { id: actual.id, nombre: actual.nombre });
  res.json({ mensaje: "Paciente y sesiones asociadas eliminados" });
}));

module.exports = router;
