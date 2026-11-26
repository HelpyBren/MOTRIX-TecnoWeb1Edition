/* ======================================================================
   MOTRIX — Punto de entrada del servidor
   npm start  →  http://localhost:3000
   ====================================================================== */
"use strict";

const config = require("./config.cjs");
const { prisma, dbPath, checkSchema } = require("./db.cjs");
const { createApp } = require("./app.cjs");
const { bridge } = require("./services/mqttBridge.cjs");
const { cleanupExpired } = require("./middleware/auth.cjs");

async function main() {
  console.log(`[MOTRIX] Base de datos: ${dbPath}`);
  for (const w of config.validate()) console.warn(`[MOTRIX] Aviso: ${w}`);
  if (!(await checkSchema())) process.exit(1);

  const usuarios = await prisma.usuario.count();
  if (usuarios === 0) {
    console.warn("\n[MOTRIX] No hay usuarios. Crea el primer administrador con:");
    console.warn("          npm run admin:crear\n");
  }

  bridge.iniciar();
  await cleanupExpired();
  const limpieza = setInterval(cleanupExpired, 60 * 60 * 1000);
  limpieza.unref();

  const server = createApp().listen(config.port, () => {
    console.log(`MOTRIX EMG API disponible en http://localhost:${config.port}`);
    console.log(`Plataforma web: ${config.appUrl}`);
  });

  const cerrar = async () => {
    await bridge.detener();
    await prisma.$disconnect();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", cerrar);
  process.on("SIGTERM", cerrar);
}

main().catch((e) => {
  console.error("[MOTRIX] Error al iniciar:", e);
  process.exit(1);
});
