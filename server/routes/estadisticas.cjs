/* ======================================================================
   MOTRIX — /api/estadisticas/resumen
   Indicadores calculados exclusivamente con datos de la base, dentro del
   alcance del usuario y con los mismos filtros que el historial.
   ====================================================================== */
"use strict";

const express = require("express");
const config = require("../config.cjs");
const { prisma } = require("../db.cjs");
const { asyncHandler } = require("../utils/http.cjs");
const { construirFiltroSesiones } = require("../services/filtros.cjs");
const { pacienteWhere } = require("../services/permisos.cjs");
const { bridge } = require("../services/mqttBridge.cjs");
const { tzOffsetMs } = require("../utils/time.cjs");

const router = express.Router();

function diaLocal(fecha) {
  const d = new Date(fecha);
  return new Date(d.getTime() + tzOffsetMs(d)).toISOString().slice(0, 10);
}

router.get("/resumen", asyncHandler(async (req, res) => {
  const query = { ...req.query };
  const dias = Math.min(Math.max(Number(query.dias) || 30, 7), 365);
  delete query.dias;

  // Por defecto, la serie temporal cubre los últimos `dias` días.
  if (!query.desde && !query.hasta) {
    const desde = new Date(Date.now() - (dias - 1) * 86400000);
    query.desde = diaLocal(desde);
  }
  const { where } = construirFiltroSesiones(query, req.user);
  const { where: whereTodas } = construirFiltroSesiones({}, req.user);

  const [sesiones, totalSesiones, totalPacientes, dispositivos, ultimas, agregados] = await Promise.all([
    prisma.sesion.findMany({
      where,
      select: { fecha: true, terapia: true, duracionSeg: true, repeticiones: true, rmsPromedio: true, pacienteId: true },
      orderBy: { fecha: "asc" },
    }),
    prisma.sesion.count({ where: whereTodas }),
    prisma.paciente.count({ where: pacienteWhere(req.user) }),
    prisma.dispositivo.findMany(),
    prisma.sesion.findMany({
      where: whereTodas, orderBy: { fecha: "desc" }, take: 6,
      select: { id: true, fecha: true, pacienteNombre: true, terapia: true, duracionSeg: true, repeticiones: true },
    }),
    prisma.sesion.aggregate({ where: whereTodas, _sum: { duracionSeg: true, repeticiones: true } }),
  ]);

  // Serie diaria continua (días sin sesiones = 0, no se inventan valores).
  const inicio = query.desde || diaLocal(sesiones[0]?.fecha || new Date());
  const fin = query.hasta || diaLocal(new Date());
  const porDia = new Map();
  for (let d = new Date(`${inicio}T12:00:00Z`); d.toISOString().slice(0, 10) <= fin; d = new Date(d.getTime() + 86400000)) {
    porDia.set(d.toISOString().slice(0, 10), { dia: d.toISOString().slice(0, 10), sesiones: 0, minutos: 0, repeticiones: 0 });
    if (porDia.size > 400) break;
  }
  const porTerapia = new Map();
  const pacientesActivos = new Set();
  for (const s of sesiones) {
    const k = diaLocal(s.fecha);
    const fila = porDia.get(k) || { dia: k, sesiones: 0, minutos: 0, repeticiones: 0 };
    fila.sesiones += 1;
    fila.minutos += s.duracionSeg / 60;
    fila.repeticiones += s.repeticiones;
    porDia.set(k, fila);
    const t = s.terapia || "Sin terapia";
    porTerapia.set(t, (porTerapia.get(t) || 0) + 1);
    pacientesActivos.add(s.pacienteId);
  }

  res.json({
    zonaHoraria: config.timezone,
    rango: { desde: inicio, hasta: fin },
    totales: {
      pacientes: totalPacientes,
      sesiones: totalSesiones,
      minutosTerapia: Math.round((agregados._sum.duracionSeg || 0) / 60),
      repeticiones: agregados._sum.repeticiones || 0,
      sesionesEnRango: sesiones.length,
      pacientesActivosEnRango: pacientesActivos.size,
      dispositivos: dispositivos.length,
      dispositivosEnLinea: dispositivos.filter((d) => bridge.enLinea(d)).length,
    },
    porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)).map((f) => ({ ...f, minutos: Math.round(f.minutos * 10) / 10 })),
    porTerapia: [...porTerapia.entries()].map(([terapia, sesiones]) => ({ terapia, sesiones })).sort((a, b) => b.sesiones - a.sesiones),
    ultimas,
    broker: bridge.estadoBroker(),
  });
}));

module.exports = router;
