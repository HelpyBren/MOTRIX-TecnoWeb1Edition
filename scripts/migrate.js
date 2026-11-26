#!/usr/bin/env node
/* ======================================================================
   MOTRIX — Migración segura de la base SQLite
   1. Hace una copia de seguridad de la base en prisma/backups/.
   2. Aplica, en orden, las migraciones de prisma/migrations que aún no
      estén registradas en _prisma_migrations (mismo formato que Prisma,
      así que `npx prisma migrate deploy` las reconoce como aplicadas).
   Cada migración se ejecuta dentro de una transacción.
   Uso:  npm run db:migrate
   ====================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

process.env.DOTENV_PATH = process.env.DOTENV_PATH || path.join(__dirname, "..", ".env");
const config = require("../server/config.cjs");
const { resolveSqlitePath } = require("../server/db-path");

const dbPath = resolveSqlitePath(config.databaseUrl);
const migrationsDir = path.join(config.root, "prisma", "migrations");

function main() {
  const existe = fs.existsSync(dbPath);
  if (existe) {
    const backups = path.join(path.dirname(dbPath), "backups");
    fs.mkdirSync(backups, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const destino = path.join(backups, `dev-${stamp}.db`);
    // Copia consistente aunque la base esté en uso.
    const src = new Database(dbPath, { readonly: true });
    src.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    src.close();
    console.log(`✔ Copia de seguridad: ${path.relative(config.root, destino)}`);
  } else {
    console.log("• No existe la base de datos; se creará una nueva.");
  }

  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
  )`);

  const aplicadas = new Map(
    db.prepare(`SELECT migration_name, checksum FROM _prisma_migrations WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL`)
      .all().map((r) => [r.migration_name, r.checksum]),
  );
  const carpetas = fs.readdirSync(migrationsDir).filter((d) => fs.existsSync(path.join(migrationsDir, d, "migration.sql"))).sort();

  let nuevas = 0;
  for (const nombre of carpetas) {
    const sql = fs.readFileSync(path.join(migrationsDir, nombre, "migration.sql"));
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    if (aplicadas.has(nombre)) {
      if (aplicadas.get(nombre) !== checksum) console.warn(`⚠ La migración ${nombre} cambió después de aplicarse (checksum distinto).`);
      continue;
    }
    const inicio = Date.now();
    console.log(`→ Aplicando ${nombre} ...`);
    // Las migraciones de Prisma para SQLite usan PRAGMA foreign_keys, que no
    // tiene efecto dentro de una transacción: se desactivan antes y se
    // comprueba la integridad referencial al terminar.
    db.pragma("foreign_keys = OFF");
    try {
      db.exec("BEGIN");
      db.exec(sql.toString("utf8"));
      const fallos = db.pragma("foreign_key_check");
      if (fallos.length) throw new Error(`Integridad referencial rota en ${fallos.length} fila(s).`);
      db.prepare(`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
                  VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`).run(crypto.randomUUID(), checksum, Date.now(), nombre, inicio);
      db.exec("COMMIT");
      nuevas += 1;
      console.log(`✔ ${nombre}`);
    } catch (e) {
      db.exec("ROLLBACK");
      console.error(`✖ Error en ${nombre}: ${e.message}`);
      console.error("  La base quedó como estaba. Revisa el error o restaura la copia de seguridad.");
      process.exit(1);
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }
  db.close();
  console.log(nuevas ? `\nListo: ${nuevas} migración(es) aplicada(s).` : "\nLa base de datos ya estaba actualizada.");
}

main();
