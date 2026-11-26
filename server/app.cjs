/* ======================================================================
   MOTRIX — Aplicación Express
   Sirve el frontend (carpeta public/) y la API (/api) desde el mismo
   origen, lo que permite usar cookies de sesión httpOnly + SameSite.
   Nota: solo public/ es accesible; .env, prisma/ y server/ nunca se sirven.
   ====================================================================== */
"use strict";

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const config = require("./config.cjs");
const { HttpError } = require("./utils/http.cjs");
const { loadUser, requireAuth, requireAppHeader, protectPage } = require("./middleware/auth.cjs");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(loadUser);

  /* ------------------------------ API ------------------------------ */
  const api = express.Router();
  api.use(requireAppHeader);
  api.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  api.get("/", (_req, res) => res.json({ mensaje: "API de MOTRIX EMG funcionando correctamente" }));
  api.use("/auth", require("./routes/auth.cjs"));
  api.use("/usuarios", requireAuth, require("./routes/usuarios.cjs"));
  api.use("/pacientes", requireAuth, require("./routes/pacientes.cjs"));
  api.use("/sesiones", requireAuth, require("./routes/sesiones.cjs"));
  api.use("/dispositivos", requireAuth, require("./routes/dispositivos.cjs"));
  api.use("/exportar", requireAuth, require("./routes/exportar.cjs"));
  api.use("/estadisticas", requireAuth, require("./routes/estadisticas.cjs"));
  api.use("/tiempo-real", requireAuth, require("./routes/tiempoReal.cjs"));
  api.use((_req, _res, next) => next(new HttpError(404, "Ruta no encontrada")));
  app.use("/api", api);

  /* --------------------------- Frontend ---------------------------- */
  const publicDir = path.join(config.root, "public");
  // Páginas internas: sin sesión válida se redirige al login.
  for (const pagina of ["/dashboard.html", "/registro.html"]) {
    app.get(pagina, protectPage, (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  }
  app.get("/dashboard", (_req, res) => res.redirect(301, "/dashboard.html"));
  app.get("/login", (_req, res) => res.redirect(301, "/login.html"));
  app.use(express.static(publicDir, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (/\.(webp|jpg|jpeg|png|svg|woff2?)$/.test(filePath)) res.setHeader("Cache-Control", "public, max-age=604800");
    },
  }));
  app.use((req, res) => {
    res.status(404);
    if (req.accepts("html")) return res.sendFile(path.join(publicDir, "404.html"));
    res.json({ error: "No encontrado" });
  });

  /* ------------------------ Manejo de errores ----------------------- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === "entity.parse.failed") err = new HttpError(400, "JSON no válido.");
    const status = err.status || 500;
    if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    if (res.headersSent) return res.end();
    res.status(status).json({ error: status >= 500 ? "Error interno del servidor." : err.message, ...(err.extra || {}) });
  });

  return app;
}

module.exports = { createApp };
