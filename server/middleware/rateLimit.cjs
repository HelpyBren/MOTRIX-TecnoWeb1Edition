/* ======================================================================
   MOTRIX — Limitador de peticiones en memoria (por IP y ruta).
   Suficiente para una sola instancia del servidor; si se despliegan
   varias instancias, conviene un almacén compartido (p. ej. Redis).
   ====================================================================== */
"use strict";

const { HttpError, clientIp } = require("../utils/http.cjs");

function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = `${clientIp(req)}|${req.baseUrl}${req.path}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
      return next(new HttpError(429, message || "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."));
    }
    next();
  };
}

module.exports = { rateLimit };
