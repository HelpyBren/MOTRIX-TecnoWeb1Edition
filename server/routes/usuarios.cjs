/* ======================================================================
   MOTRIX — /api/usuarios (solo administradores)
   Alta, edición, activación, cambio de rol y enlaces de restablecimiento.
   ====================================================================== */
"use strict";

const express = require("express");
const { prisma } = require("../db.cjs");
const { asyncHandler, HttpError } = require("../utils/http.cjs");
const { hashPassword, passwordProblem } = require("../utils/security.cjs");
const { requireRole, ROLES, publicUser } = require("../middleware/auth.cjs");
const { audit } = require("../services/audit.cjs");
const { crearEnlaceRecuperacion, validarNuevoUsuario, asegurarUnico } = require("./auth.cjs");

const router = express.Router();
router.use(requireRole(ROLES.ADMIN));

const SELECT = {
  id: true, nombre: true, usuario: true, correo: true, rol: true, activo: true,
  ultimoAcceso: true, creadoEn: true, bloqueadoHasta: true,
  _count: { select: { pacientes: true, sesiones: true } },
};

router.get("/", asyncHandler(async (_req, res) => {
  res.json(await prisma.usuario.findMany({ select: SELECT, orderBy: { creadoEn: "asc" } }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const datos = validarNuevoUsuario(req.body);
  const rol = req.body?.rol === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USUARIO;
  const problema = passwordProblem(req.body?.password);
  if (problema) throw new HttpError(400, problema);
  await asegurarUnico(datos.usuario, datos.correo);
  const u = await prisma.usuario.create({
    data: { ...datos, rol, activo: true, passwordHash: await hashPassword(req.body.password) },
    select: SELECT,
  });
  await audit(req, "usuario_creado", { usuario: u.usuario, rol });
  res.status(201).json(u);
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const actual = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!actual) throw new HttpError(404, "Usuario no encontrado.");
  const datos = validarNuevoUsuario(req.body);
  const rol = req.body?.rol === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USUARIO;
  const activo = req.body?.activo === undefined ? actual.activo : Boolean(req.body.activo);
  await asegurarUnico(datos.usuario, datos.correo, actual.id);

  if (actual.id === req.user.id && (rol !== ROLES.ADMIN || !activo)) {
    throw new HttpError(400, "No puedes quitarte el rol de administrador ni desactivar tu propia cuenta.");
  }
  if (actual.rol === ROLES.ADMIN && (rol !== ROLES.ADMIN || !activo)) await asegurarOtroAdmin(actual.id);

  const data = { ...datos, rol, activo };
  if (req.body?.password) {
    const problema = passwordProblem(req.body.password);
    if (problema) throw new HttpError(400, problema);
    data.passwordHash = await hashPassword(req.body.password);
  }
  const u = await prisma.usuario.update({ where: { id: actual.id }, data, select: SELECT });
  if (!activo || data.passwordHash) {
    await prisma.sesionAcceso.deleteMany({ where: { usuarioId: actual.id, ...(actual.id === req.user.id ? { NOT: { id: req.sessionId } } : {}) } });
  }
  await audit(req, "usuario_actualizado", { usuario: u.usuario, rol, activo, cambioPassword: Boolean(data.passwordHash) });
  res.json(u);
}));

router.post("/:id/enlace-restablecer", asyncHandler(async (req, res) => {
  const u = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!u) throw new HttpError(404, "Usuario no encontrado.");
  const enlace = await crearEnlaceRecuperacion(u);
  await audit(req, "enlace_restablecer_generado", { usuario: u.usuario });
  res.json({ enlace, mensaje: "Comparte este enlace solo con la persona titular de la cuenta. Es de un solo uso." });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const u = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!u) throw new HttpError(404, "Usuario no encontrado.");
  if (u.id === req.user.id) throw new HttpError(400, "No puedes eliminar tu propia cuenta.");
  if (u.rol === ROLES.ADMIN) await asegurarOtroAdmin(u.id);
  // Pacientes y sesiones se conservan: su responsable pasa a "sin asignar".
  await prisma.usuario.delete({ where: { id: u.id } });
  await audit(req, "usuario_eliminado", { usuario: u.usuario });
  res.json({ mensaje: "Usuario eliminado. Sus pacientes y sesiones se conservan sin responsable asignado." });
}));

router.get("/auditoria/recientes", asyncHandler(async (_req, res) => {
  const rows = await prisma.auditoria.findMany({
    orderBy: { fecha: "desc" }, take: 100,
    include: { usuario: { select: { nombre: true, usuario: true } } },
  });
  res.json(rows);
}));

async function asegurarOtroAdmin(exceptoId) {
  const otros = await prisma.usuario.count({ where: { rol: ROLES.ADMIN, activo: true, NOT: { id: exceptoId } } });
  if (otros === 0) throw new HttpError(400, "Debe existir al menos otro administrador activo.");
}

module.exports = router;
module.exports.publicUser = publicUser;
