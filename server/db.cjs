/* ======================================================================
   MOTRIX — Cliente Prisma (SQLite vía sqlite3)
   Usa el cliente Prisma sin motor Rust (engineType = "client").
   timestampFormat "unixepoch-ms" mantiene el formato de fechas que ya
   tenía la base de datos original (milisegundos desde 1970).
   ====================================================================== */
"use strict";

const { PrismaClient } = require("@prisma/client");
const config = require("./config.cjs");
const { resolveSqlitePath } = require("./db-path.cjs");

const dbPath = resolveSqlitePath(config.databaseUrl);
const prisma = new PrismaClient();

async function checkSchema() {
  // Detecta una base sin migrar y explica cómo resolverlo.
  try {
    await prisma.usuario.count();
    return true;
  } catch (e) {
    console.error("\n[MOTRIX] La base de datos no tiene las tablas nuevas (Usuario, etc.).");
    console.error("          Ejecuta:  npm run db:migrate   (crea una copia de seguridad antes de migrar)\n");
    return false;
  }
}

module.exports = { prisma, dbPath, resolveSqlitePath, checkSchema };
