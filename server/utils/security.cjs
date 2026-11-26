/* ======================================================================
   MOTRIX — Utilidades de seguridad
   * Hash de contraseñas con scrypt (incluido en Node, sin dependencias
     nativas). Formato: scrypt$N$r$p$salt$hash (base64url).
   * Tokens aleatorios: solo se guarda su SHA-256 en la base de datos.
   ====================================================================== */
"use strict";

const crypto = require("crypto");

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(String(password), salt, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

async function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const expected = Buffer.from(hashB64, "base64url");
    const key = await scryptAsync(String(password), Buffer.from(saltB64, "base64url"), {
      N: Number(N), r: Number(r), p: Number(p), keylen: expected.length,
    });
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe.
let dummyHash = null;
async function dummyVerify(password) {
  if (!dummyHash) dummyHash = await hashPassword("motrix-dummy-password");
  await verifyPassword(password, dummyHash);
  return false;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/** Política de contraseñas: devuelve un mensaje de error o null. */
function passwordProblem(password) {
  const p = String(password || "");
  if (p.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (p.length > 128) return "La contraseña no puede superar 128 caracteres.";
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(p) || !/\d/.test(p)) return "La contraseña debe combinar letras y números.";
  const comunes = ["12345678", "password1", "contraseña1", "motrix123", "qwerty123", "admin1234"];
  if (comunes.includes(p.toLowerCase())) return "Esa contraseña es demasiado común.";
  return null;
}

module.exports = { hashPassword, verifyPassword, dummyVerify, randomToken, sha256, passwordProblem };
