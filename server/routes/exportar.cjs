/* ======================================================================
   MOTRIX — /api/exportar/sesiones.xlsx
   Consulta la base de datos real, aplica los filtros recibidos y el
   alcance del usuario autenticado, y descarga un .xlsx.
   ====================================================================== */
"use strict";

const express = require("express");
const { prisma } = require("../db.cjs");
const { asyncHandler, HttpError } = require("../utils/http.cjs");
const { isAdmin } = require("../middleware/auth.cjs");
const { construirFiltroSesiones } = require("../services/filtros.cjs");
const { pacienteWhere } = require("../services/permisos.cjs");
const { construirLibro, nombreArchivo } = require("../services/excel.cjs");
const { audit } = require("../services/audit.cjs");
const { rateLimit } = require("../middleware/rateLimit.cjs");

const router = express.Router();
const MAX_FILAS = 100000;

router.get("/sesiones.xlsx", rateLimit({ windowMs: 60 * 1000, max: 20 }), asyncHandler(async (req, res) => {
  const { where, aplicados } = construirFiltroSesiones(req.query, req.user);
  const filtrado = Object.keys(aplicados).length > 0;

  const total = await prisma.sesion.count({ where });
  if (total > MAX_FILAS) throw new HttpError(413, `La exportación supera ${MAX_FILAS} filas. Acota el rango de fechas.`);

  const sesiones = await prisma.sesion.findMany({
    where,
    orderBy: { fecha: "desc" },
    include: {
      paciente: { select: { edad: true, sexo: true, brazo: true } },
      registradaPor: { select: { nombre: true } },
      dispositivo: { select: { codigo: true, nombre: true } },
    },
  });

  // Sin filtros: todos los pacientes autorizados (incluso sin sesiones).
  // Con filtros: solo los pacientes que aparecen en las sesiones exportadas.
  const pacienteFiltro = filtrado
    ? { AND: [pacienteWhere(req.user), { id: { in: [...new Set(sesiones.map((s) => s.pacienteId))] } }] }
    : pacienteWhere(req.user);
  const pacientes = await prisma.paciente.findMany({
    where: pacienteFiltro,
    orderBy: { nombre: "asc" },
    include: { responsable: { select: { nombre: true } } },
  });

  const legibles = await describirFiltros(aplicados);
  const wb = await construirLibro({
    sesiones, pacientes, filtros: { legibles }, usuario: req.user,
    alcance: isAdmin(req.user) ? "Todos los registros (administrador)" : "Pacientes asignados y sesiones registradas por el usuario",
  });

  await audit(req, "exportacion_excel", { filas: sesiones.length, filtros: aplicados });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo(filtrado)}"`);
  res.setHeader("Cache-Control", "no-store");
  await wb.xlsx.write(res);
  res.end();
}));

async function describirFiltros(aplicados) {
  const out = { ...aplicados };
  if (aplicados.pacienteId) {
    const p = await prisma.paciente.findUnique({ where: { id: aplicados.pacienteId }, select: { nombre: true } });
    out.pacienteId = p ? `${p.nombre} (${aplicados.pacienteId})` : aplicados.pacienteId;
  }
  if (aplicados.usuarioId) {
    if (aplicados.usuarioId === "ninguno") out.usuarioId = "Sin usuario (registros históricos)";
    else {
      const u = await prisma.usuario.findUnique({ where: { id: aplicados.usuarioId }, select: { nombre: true } });
      out.usuarioId = u ? u.nombre : aplicados.usuarioId;
    }
  }
  if (aplicados.dispositivoId) {
    if (aplicados.dispositivoId === "ninguno") out.dispositivoId = "Sin dispositivo registrado";
    else {
      const d = await prisma.dispositivo.findUnique({ where: { id: Number(aplicados.dispositivoId) }, select: { codigo: true } });
      out.dispositivoId = d ? d.codigo : aplicados.dispositivoId;
    }
  }
  return out;
}

module.exports = router;
