/* ======================================================================
   MOTRIX — Envío de correos (recuperación de contraseña).
   Con SMTP configurado usa nodemailer. Sin SMTP y fuera de producción,
   muestra el enlace en la consola del servidor para poder probar.
   ====================================================================== */
"use strict";

const config = require("../config.cjs");

let transporter = null;
function getTransporter() {
  if (!config.smtp.enabled) return null;
  if (!transporter) {
    const nodemailer = require("nodemailer");
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

async function sendPasswordReset(usuario, link, minutos) {
  const t = getTransporter();
  const texto = [
    `Hola ${usuario.nombre},`,
    "",
    "Recibimos una solicitud para restablecer tu contraseña de la plataforma MOTRIX.",
    `Abre este enlace (válido durante ${minutos} minutos, un solo uso):`,
    link,
    "",
    "Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando.",
  ].join("\n");

  if (!t) {
    if (config.isProd) {
      console.warn(`[correo] SMTP no configurado: no se envió el enlace de recuperación a ${usuario.correo}.`);
      return { enviado: false };
    }
    console.log("\n──────── [DESARROLLO] Enlace de recuperación de contraseña ────────");
    console.log(`Para: ${usuario.correo}`);
    console.log(link);
    console.log("────────────────────────────────────────────────────────────────────\n");
    return { enviado: false, consola: true };
  }
  await t.sendMail({
    from: config.smtp.from,
    to: usuario.correo,
    subject: "MOTRIX · Restablecer contraseña",
    text: texto,
  });
  return { enviado: true };
}

module.exports = { sendPasswordReset };
