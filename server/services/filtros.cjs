/* ======================================================================
   MOTRIX — Filtros de sesiones compartidos por el historial, la
   exportación a Excel y las estadísticas. Siempre se combinan con el
   alcance del usuario autenticado (services/permisos.js).
   ====================================================================== */
"use strict";

const { HttpError, parseDate } = require("../utils/http.cjs");
const { isAdmin } = require("../middleware/auth.cjs");
const { sesionWhere } = require("./permisos.cjs");

function construirFiltroSesiones(query = {}, user) {
  const and = [sesionWhere(user)];
  const aplicados = {};

  const desde = parseDate(query.desde, { field: "fecha inicial" });
  const hasta = parseDate(query.hasta, { endOfDay: true, field: "fecha final" });
  if (desde && hasta && desde > hasta) throw new HttpError(400, "La fecha inicial no puede ser posterior a la final.");
  if (desde || hasta) {
    and.push({ fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } });
    if (desde) aplicados.desde = query.desde;
    if (hasta) aplicados.hasta = query.hasta;
  }
  if (query.pacienteId) {
    and.push({ pacienteId: String(query.pacienteId) });
    aplicados.pacienteId = String(query.pacienteId);
  }
  if (query.terapia) {
    and.push({ terapia: String(query.terapia) });
    aplicados.terapia = String(query.terapia);
  }
  if (query.brazo) {
    and.push({ paciente: { brazo: String(query.brazo) } });
    aplicados.brazo = String(query.brazo);
  }
  if (query.sexo) {
    and.push({ paciente: { sexo: String(query.sexo) } });
    aplicados.sexo = String(query.sexo);
  }
  if (query.dispositivoId) {
    if (query.dispositivoId === "ninguno") and.push({ dispositivoId: null });
    else {
      const id = Number(query.dispositivoId);
      if (!Number.isInteger(id)) throw new HttpError(400, "Dispositivo no válido.");
      and.push({ dispositivoId: id });
    }
    aplicados.dispositivoId = String(query.dispositivoId);
  }
  // Filtrar por usuario que registró la sesión: solo administradores.
  if (query.usuarioId) {
    if (!isAdmin(user)) throw new HttpError(403, "Solo un administrador puede filtrar por usuario.");
    and.push({ registradaPorId: query.usuarioId === "ninguno" ? null : String(query.usuarioId) });
    aplicados.usuarioId = String(query.usuarioId);
  }
  if (query.q) {
    const q = String(query.q).slice(0, 80);
    and.push({ OR: [{ pacienteNombre: { contains: q } }, { pacienteId: { contains: q } }, { terapia: { contains: q } }] });
    aplicados.q = q;
  }
  return { where: { AND: and }, aplicados };
}

module.exports = { construirFiltroSesiones };
