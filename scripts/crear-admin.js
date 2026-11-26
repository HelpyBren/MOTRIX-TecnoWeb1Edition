#!/usr/bin/env node
/* ======================================================================
   MOTRIX — Crear (o restablecer) un administrador desde la terminal.
   Uso interactivo:   npm run admin:crear
   Uso no interactivo (CI / pruebas):
     ADMIN_NOMBRE="Ana" ADMIN_USUARIO=admin ADMIN_CORREO=ana@ej.com \
     ADMIN_PASSWORD="ClaveSegura123" npm run admin:crear
   ====================================================================== */
"use strict";

const readline = require("readline");
const { prisma } = require("../server/db.cjs");
const { hashPassword, passwordProblem } = require("../server/utils/security.cjs");

function preguntar(rl, texto, { oculto = false } = {}) {
  return new Promise((resolve) => {
    if (!oculto) return rl.question(texto, (r) => resolve(r.trim()));
    const salida = rl.output;
    const original = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(texto)) salida.write(s); else salida.write("*"); };
    rl.question(texto, (r) => { rl._writeToOutput = original; salida.write("\n"); resolve(r); });
  });
}

async function main() {
  let { ADMIN_NOMBRE: nombre, ADMIN_USUARIO: usuario, ADMIN_CORREO: correo, ADMIN_PASSWORD: password } = process.env;
  if (!nombre || !usuario || !correo || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    console.log("Crear administrador de MOTRIX\n");
    nombre = nombre || await preguntar(rl, "Nombre completo: ");
    usuario = usuario || await preguntar(rl, "Usuario (ej. admin): ");
    correo = correo || await preguntar(rl, "Correo electrónico: ");
    password = password || await preguntar(rl, "Contraseña (mín. 8, letras y números): ", { oculto: true });
    rl.close();
  }
  usuario = String(usuario).trim().toLowerCase();
  correo = String(correo).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error("Usuario no válido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) throw new Error("Correo no válido.");
  const problema = passwordProblem(password);
  if (problema) throw new Error(problema);

  const existente = await prisma.usuario.findFirst({ where: { OR: [{ usuario }, { correo }] } });
  const passwordHash = await hashPassword(password);
  if (existente) {
    await prisma.usuario.update({
      where: { id: existente.id },
      data: { nombre, usuario, correo, passwordHash, rol: "ADMIN", activo: true, intentosFallidos: 0, bloqueadoHasta: null },
    });
    console.log(`✔ Usuario "${usuario}" actualizado como administrador.`);
  } else {
    await prisma.usuario.create({ data: { nombre, usuario, correo, passwordHash, rol: "ADMIN", activo: true } });
    console.log(`✔ Administrador "${usuario}" creado.`);
  }
}

main()
  .catch((e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
