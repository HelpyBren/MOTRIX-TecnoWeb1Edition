/* MOTRIX — Ruta del archivo SQLite a partir de DATABASE_URL.
   Prisma resuelve "file:./dev.db" respecto a la carpeta prisma/; se
   replica ese comportamiento para no cambiar la configuración existente. */
"use strict";

const path = require("path");
const config = require("./config.cjs");

function resolveSqlitePath(url = config.databaseUrl) {
  const raw = String(url).replace(/^file:/, "");
  if (raw === ":memory:") return raw;
  return path.isAbsolute(raw) ? raw : path.join(config.root, "prisma", raw);
}

module.exports = { resolveSqlitePath };
