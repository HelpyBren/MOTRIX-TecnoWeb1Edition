/* Interoperabilidad servidor ↔ firmware: los comandos firmados por
   server/services/deviceCrypto.js deben verificarse y descifrarse con
   firmware/motrix_esp32/seguridad.cpp (compilado en la PC con g++ y OpenSSL). */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");
const dc = require("../server/services/deviceCrypto");

const raiz = path.join(__dirname, "..");
const fw = path.join(raiz, "firmware");
function hayCompilador() {
  return spawnSync("g++", ["--version"]).status === 0 && fs.existsSync("/usr/include/openssl/hmac.h");
}

test("firmware verifica y descifra los comandos del servidor", { skip: !hayCompilador() && "g++/OpenSSL no disponibles" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "motrix-fw-"));
  const bin = path.join(dir, "prueba");
  execFileSync("g++", ["-std=c++17", "-O1", `-I${path.join(fw, "motrix_esp32")}`, path.join(fw, "pruebas", "prueba_seguridad.cpp"),
    path.join(fw, "motrix_esp32", "seguridad.cpp"), "-lcrypto", "-o", bin]);

  const master = "x".repeat(40);
  const codigo = "MOTRIX-01";
  const key = dc.claveDispositivo(codigo, master);
  const casos = [
    { ssid: "Hospital Beni", password: "clave-segura-2026" },
    { ssid: "Red \"comillas\" \\ barra", password: "ñandú-áéíóú-€-😀x" },
    { ssid: "Abierta", password: "" },
    { ssid: "Larga", password: "p".repeat(63) },
    { ssid: "日本語のネットワーク", password: "12345678" },
  ];
  const cmds = casos.map((c) => dc.crearComando(codigo, "wifi", c, { key }));
  cmds.push(dc.crearComando(codigo, "portal", {}, { key }));
  const alterado = { ...dc.crearComando(codigo, "wifi", { ssid: "Original", password: "abcdefgh1" }, { key }), s: "Otra" };
  cmds.push(alterado);
  const otraClave = dc.crearComando(codigo, "wifi", { ssid: "X", password: "abcdefgh1" }, { key: Buffer.alloc(32, 7) });
  cmds.push(otraClave);

  const salida = execFileSync(bin, [key.toString("hex")], { input: cmds.map((c) => JSON.stringify(c)).join("\n") + "\n" }).toString().trim().split("\n");
  casos.forEach((c, i) => assert.deepStrictEqual(salida[i].split("\t"), ["ok", "wifi", c.ssid, c.password], `caso ${i}`));
  assert.strictEqual(salida[casos.length], "ok\tportal\t\t");
  assert.strictEqual(salida[casos.length + 1], "firma", "un SSID alterado debe rechazarse");
  assert.strictEqual(salida[casos.length + 2], "firma", "una clave distinta debe rechazarse");
});
