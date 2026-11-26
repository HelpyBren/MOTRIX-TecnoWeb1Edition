/* ======================================================================
   MOTRIX — /api/auth : inicio y cierre de sesión, registro opcional,
   recuperación y cambio de contraseña.
   ====================================================================== */
"use strict";

const express = require("express");
const config = require("../config.cjs");
const { prisma } = require("../db.cjs");
const { asyncHandler, HttpError, str } = require("../utils/http.cjs");
const { hashPassword, verifyPassword, dummyVerify, randomToken, sha256, passwordProblem } = require("../utils/security.cjs");
const { createSession, destroySession, publicUser, requireAuth, ROLES } = require("../middleware/auth.cjs");
const { rateLimit } = require("../middleware/rateLimit.cjs");
const { audit } = require("../services/audit.cjs");
const { sendPasswordReset } = require("../services/mailer.cjs");

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const recoveryLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 6 });

const MENSAJE_LOGIN = "Usuario o contraseña incorrectos.";

router.get("/opciones", (_req, res) => {
  res.json({ registroHabilitado: config.auth.allowSelfSignup, correoConfigurado: config.smtp.enabled });
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Sin sesión activa." });
  res.json({ usuario: publicUser(req.user) });
});

router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const identificador = String(req.body?.identificador || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!identificador || !password) throw new HttpError(400, "Ingresa tu usuario o correo y tu contraseña.");

  const usuario = await prisma.usuario.findFirst({
    where: { OR: [{ usuario: identificador }, { correo: identificador }] },
  });

  if (!usuario) {
    await dummyVerify(password);
    await audit(req, "login_fallido", { identificador });
    throw new HttpError(401, MENSAJE_LOGIN);
  }
  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > Date.now()) {
    const min = Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60000);
    throw new HttpError(423, `Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo en ${min} min.`);
  }

  const ok = await verifyPassword(password, usuario.passwordHash);
  if (!ok) {
    const intentos = usuario.intentosFallidos + 1;
    const bloquear = intentos >= config.auth.maxFailedLogins;
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        intentosFallidos: bloquear ? 0 : intentos,
        bloqueadoHasta: bloquear ? new Date(Date.now() + config.auth.lockMinutes * 60000) : null,
      },
    });
    await audit(req, bloquear ? "cuenta_bloqueada" : "login_fallido", { identificador }, usuario.id);
    throw new HttpError(401, MENSAJE_LOGIN);
  }
  if (!usuario.activo) throw new HttpError(403, "Tu cuenta está desactivada o pendiente de aprobación por un administrador.");

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: new Date() },
  });
  // Evita fijación de sesión: elimina la sesión previa del navegador, si existía.
  await destroySession(req, res, { limpiarCookie: false });
  await createSession(res, usuario, req);
  await audit(req, "login", null, usuario.id);
  res.json({ usuario: publicUser(usuario) });
}));

router.post("/logout", asyncHandler(async (req, res) => {
  if (req.user) await audit(req, "logout");
  await destroySession(req, res);
  res.json({ ok: true });
}));

router.post("/registro", loginLimiter, asyncHandler(async (req, res) => {
  if (!config.auth.allowSelfSignup) throw new HttpError(403, "El registro público está deshabilitado. Solicita una cuenta a un administrador.");
  const datos = validarNuevoUsuario(req.body);
  const problema = passwordProblem(req.body?.password);
  if (problema) throw new HttpError(400, problema);
  await asegurarUnico(datos.usuario, datos.correo);
  const nuevo = await prisma.usuario.create({
    data: { ...datos, rol: ROLES.USUARIO, activo: false, passwordHash: await hashPassword(req.body.password) },
  });
  await audit(req, "registro_pendiente", null, nuevo.id);
  res.status(201).json({ mensaje: "Cuenta creada. Un administrador debe activarla antes de que puedas ingresar." });
}));

router.post("/recuperar", recoveryLimiter, asyncHandler(async (req, res) => {
  const correo = String(req.body?.correo || "").trim().toLowerCase();
  const respuesta = { mensaje: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." };
  if (!correo) throw new HttpError(400, "Ingresa tu correo electrónico.");
  const usuario = await prisma.usuario.findUnique({ where: { correo } });
  if (usuario && usuario.activo) {
    const enlace = await crearEnlaceRecuperacion(usuario);
    await sendPasswordReset(usuario, enlace, config.auth.resetTtlMinutes).catch((e) => {
      console.error("[correo] Error enviando recuperación:", e.message);
    });
    await audit(req, "recuperacion_solicitada", null, usuario.id);
  }
  // Respuesta idéntica exista o no la cuenta (evita enumerar usuarios).
  res.json(respuesta);
}));

router.post("/restablecer", recoveryLimiter, asyncHandler(async (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  const problema = passwordProblem(password);
  if (problema) throw new HttpError(400, problema);
  const registro = token ? await prisma.tokenRecuperacion.findUnique({ where: { tokenHash: sha256(token) } }) : null;
  if (!registro || registro.usadoEn || registro.expiraEn.getTime() < Date.now()) {
    throw new HttpError(400, "El enlace no es válido o ha caducado. Solicita uno nuevo.");
  }
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: registro.usuarioId },
      data: { passwordHash: await hashPassword(password), intentosFallidos: 0, bloqueadoHasta: null },
    }),
    prisma.tokenRecuperacion.update({ where: { id: registro.id }, data: { usadoEn: new Date() } }),
    // Cierra todas las sesiones abiertas de ese usuario.
    prisma.sesionAcceso.deleteMany({ where: { usuarioId: registro.usuarioId } }),
  ]);
  await audit(req, "password_restablecida", null, registro.usuarioId);
  res.json({ mensaje: "Contraseña actualizada. Ya puedes iniciar sesión." });
}));

router.post("/cambiar-password", requireAuth, asyncHandler(async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!(await verifyPassword(String(actual || ""), req.user.passwordHash))) {
    throw new HttpError(400, "La contraseña actual no es correcta.");
  }
  const problema = passwordProblem(nueva);
  if (problema) throw new HttpError(400, problema);
  await prisma.usuario.update({ where: { id: req.user.id }, data: { passwordHash: await hashPassword(nueva) } });
  // Mantiene solo la sesión actual.
  await prisma.sesionAcceso.deleteMany({ where: { usuarioId: req.user.id, NOT: { id: req.sessionId } } });
  await audit(req, "password_cambiada");
  res.json({ mensaje: "Contraseña actualizada." });
}));

/* ---------------------------- utilidades ---------------------------- */
async function crearEnlaceRecuperacion(usuario) {
  const token = randomToken(32);
  await prisma.tokenRecuperacion.updateMany({
    where: { usuarioId: usuario.id, usadoEn: null },
    data: { usadoEn: new Date() }, // invalida enlaces anteriores
  });
  await prisma.tokenRecuperacion.create({
    data: {
      tokenHash: sha256(token),
      usuarioId: usuario.id,
      expiraEn: new Date(Date.now() + config.auth.resetTtlMinutes * 60000),
    },
  });
  // El token va en el fragmento (#): no se envía a servidores ni queda en logs.
  return `${config.appUrl}/restablecer.html#token=${token}`;
}

function validarNuevoUsuario(body = {}) {
  const nombre = str(body.nombre, { required: true, max: 120, field: "nombre" });
  const usuario = String(body.usuario || "").trim().toLowerCase();
  const correo = String(body.correo || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new HttpError(400, "El usuario debe tener 3 a 40 caracteres: letras, números, punto, guion o guion bajo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 160) throw new HttpError(400, "Ingresa un correo electrónico válido.");
  return { nombre, usuario, correo };
}

async function asegurarUnico(usuario, correo, exceptoId) {
  const existe = await prisma.usuario.findFirst({
    where: { OR: [{ usuario }, { correo }], ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
  });
  if (existe) throw new HttpError(409, existe.usuario === usuario ? "Ese nombre de usuario ya existe." : "Ese correo ya está registrado.");
}

module.exports = router;
module.exports.crearEnlaceRecuperacion = crearEnlaceRecuperacion;
module.exports.validarNuevoUsuario = validarNuevoUsuario;
module.exports.asegurarUnico = asegurarUnico;
