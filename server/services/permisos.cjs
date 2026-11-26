/* ======================================================================
   MOTRIX — Alcance de datos por rol
   ADMIN   → todos los pacientes y sesiones.
   USUARIO → pacientes de los que es responsable y sesiones que registró
             o que pertenecen a sus pacientes.
   Los registros históricos sin responsable solo los ve un administrador,
   que puede asignarlos desde el módulo Pacientes.
   ====================================================================== */
"use strict";

const { isAdmin } = require("../middleware/auth.cjs");

function pacienteWhere(user) {
  if (isAdmin(user)) return {};
  return { responsableId: user.id };
}

function sesionWhere(user) {
  if (isAdmin(user)) return {};
  return { OR: [{ registradaPorId: user.id }, { paciente: { responsableId: user.id } }] };
}

function puedeVerPaciente(user, paciente) {
  return !!paciente && (isAdmin(user) || paciente.responsableId === user.id);
}

module.exports = { pacienteWhere, sesionWhere, puedeVerPaciente };
