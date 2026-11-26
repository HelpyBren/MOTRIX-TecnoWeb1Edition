/* ======================================================================
   MOTRIX — Utilidades HTTP: errores, validación y manejo async.
   ====================================================================== */
"use strict";

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function clientIp(req) {
  return (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
}

function str(value, { max = 255, required = false, field = "campo" } = {}) {
  const s = value === undefined || value === null ? "" : String(value).trim();
  if (required && !s) throw new HttpError(400, `El ${field} es obligatorio.`);
  if (s.length > max) throw new HttpError(400, `El ${field} no puede superar ${max} caracteres.`);
  return s || null;
}

function intIn(value, { min, max, field, fallback }) {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} debe ser un número entero entre ${min} y ${max}.`);
  }
  return n;
}

function num(value, { field, min = -1e9, max = 1e9 }) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `El campo ${field} debe ser numérico.`);
  return n;
}

function oneOf(value, allowed, field) {
  if (value === undefined || value === null || value === "") return null;
  if (!allowed.includes(value)) throw new HttpError(400, `Valor no válido para ${field}.`);
  return value;
}

/** Fecha "YYYY-MM-DD" (o ISO) → Date. endOfDay = incluir el día completo. */
function parseDate(value, { endOfDay = false, field = "fecha" } = {}) {
  if (!value) return null;
  const s = String(value);
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // El día se interpreta en la zona horaria de la aplicación (APP_TIMEZONE).
    d = require("./time").localDayToUtc(s, endOfDay);
  } else {
    d = new Date(s);
  }
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `La ${field} no es válida.`);
  return d;
}

module.exports = { HttpError, asyncHandler, clientIp, str, intIn, num, oneOf, parseDate };
