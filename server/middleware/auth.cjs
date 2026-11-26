/* ======================================================================
   MOTRIX — Autenticación y autorización (validadas en el servidor)
   * La cookie motrix_sid contiene un token aleatorio; en la base solo se
     guarda su SHA-256 (tabla SesionAcceso).
   * requireAuth / requireRole protegen endpoints y páginas.
   * requireAppHeader bloquea peticiones de escritura que no provengan de
     la propia aplicación (protección CSRF junto a SameSite=Lax).
   ====================================================================== */
"use strict";

const config = require("../config.cjs");
const { prisma } = require("../db.cjs");
const { sha256, randomToken } = require("../utils/security.cjs");
const { HttpError, clientIp } = require("../utils/http.cjs");

const ROLES = { ADMIN: "ADMIN", USUARIO: "USUARIO" };

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.auth.cookieSecure,
    path: "/",
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

async function createSession(res, usuario, req) {
  const token = randomToken(32);
  const ttlMs = config.auth.sessionTtlHours * 3600 * 1000;
  await prisma.sesionAcceso.create({
    data: {
      tokenHash: sha256(token),
      usuarioId: usuario.id,
      expiraEn: new Date(Date.now() + ttlMs),
      ip: clientIp(req) || null,
      agente: String(req.headers["user-agent"] || "").slice(0, 255) || null,
    },
  });
  res.cookie(config.auth.cookieName, token, cookieOptions(ttlMs));
}

async function destroySession(req, res, { limpiarCookie = true } = {}) {
  const token = req.cookies?.[config.auth.cookieName];
  if (token) await prisma.sesionAcceso.deleteMany({ where: { tokenHash: sha256(token) } });
  if (limpiarCookie) res.clearCookie(config.auth.cookieName, cookieOptions());
}

function publicUser(u) {
  return u ? { id: u.id, nombre: u.nombre, usuario: u.usuario, correo: u.correo, rol: u.rol } : null;
}

/** Carga req.user si la cookie es válida. No bloquea. */
async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies?.[config.auth.cookieName];
  if (!token || token.length > 200) return next();
  try {
    const sesion = await prisma.sesionAcceso.findUnique({
      where: { tokenHash: sha256(token) },
      include: { usuario: true },
    });
    if (!sesion) return next();
    if (sesion.expiraEn.getTime() < Date.now() || !sesion.usuario.activo) {
      await prisma.sesionAcceso.delete({ where: { id: sesion.id } }).catch(() => {});
      return next();
    }
    req.user = sesion.usuario;
    req.sessionId = sesion.id;
    // Actualiza "último uso" como máximo una vez por minuto.
    if (Date.now() - sesion.ultimoUso.getTime() > 60_000) {
      prisma.sesionAcceso.update({ where: { id: sesion.id }, data: { ultimoUso: new Date() } }).catch(() => {});
    }
  } catch (e) {
    console.error("[auth] Error validando la sesión:", e.message);
  }
  next();
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "Debes iniciar sesión."));
  next();
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, "Debes iniciar sesión."));
    if (!roles.includes(req.user.rol)) return next(new HttpError(403, "No tienes permisos para esta acción."));
    next();
  };
}

const isAdmin = (user) => user?.rol === ROLES.ADMIN;

/** Las peticiones que modifican datos deben llevar la cabecera X-Requested-With: MotrixWeb. */
function requireAppHeader(req, _res, next) {
  const safe = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (safe || req.get("x-requested-with") === "MotrixWeb") return next();
  next(new HttpError(403, "Petición rechazada (origen no verificado)."));
}

/** Redirige páginas protegidas al login si no hay sesión. */
function protectPage(req, res, next) {
  if (req.user) return next();
  const destino = encodeURIComponent(req.originalUrl);
  res.redirect(302, `/login.html?next=${destino}`);
}

async function cleanupExpired() {
  const now = new Date();
  await prisma.sesionAcceso.deleteMany({ where: { expiraEn: { lt: now } } }).catch(() => {});
  await prisma.tokenRecuperacion.deleteMany({ where: { expiraEn: { lt: now } } }).catch(() => {});
}

module.exports = {
  ROLES, createSession, destroySession, publicUser, loadUser, requireAuth, requireRole,
  isAdmin, requireAppHeader, protectPage, cleanupExpired, cookieOptions,
};
