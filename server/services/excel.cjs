/* ======================================================================
   MOTRIX — Generación del archivo Excel (.xlsx) con exceljs.
   Hojas:
     1. Sesiones     → registros de la tabla Sesion (datos reales).
     2. Pacientes    → pacientes incluidos en la exportación.
     3. Información  → quién exportó, cuándo y con qué filtros.
   Fechas como fechas de Excel (hora local de APP_TIMEZONE), números como
   números, encabezados fijos y filtros automáticos.
   ====================================================================== */
"use strict";

const ExcelJS = require("exceljs");
const config = require("../config.cjs");
const { toExcelLocal, formatLocal } = require("../utils/time.cjs");

const COLOR = { ink: "FF12263F", teal: "FF1F8A84", headerText: "FFFFFFFF", zebra: "FFF3F7FA", border: "FFD5DEE7" };

const COLUMNAS_SESIONES = [
  { header: "Fecha y hora", key: "fecha", campo: "Sesion.fecha", width: 18, numFmt: "dd/mm/yyyy hh:mm" },
  { header: "ID sesión", key: "id", campo: "Sesion.id", width: 38 },
  { header: "ID paciente", key: "pacienteId", campo: "Sesion.pacienteId", width: 38 },
  { header: "Paciente", key: "pacienteNombre", campo: "Sesion.pacienteNombre", width: 26 },
  { header: "Edad", key: "edad", campo: "Paciente.edad", width: 8, numFmt: "0" },
  { header: "Sexo", key: "sexo", campo: "Paciente.sexo", width: 12 },
  { header: "Brazo", key: "brazo", campo: "Paciente.brazo", width: 12 },
  { header: "Terapia", key: "terapia", campo: "Sesion.terapia", width: 16 },
  { header: "Duración (s)", key: "duracionSeg", campo: "Sesion.duracionSeg", width: 13, numFmt: "0" },
  { header: "Duración (min)", key: "duracionMin", campo: "Sesion.duracionSeg / 60", width: 14, numFmt: "0.00" },
  { header: "Repeticiones", key: "repeticiones", campo: "Sesion.repeticiones", width: 13, numFmt: "0" },
  { header: "RMS promedio (mV)", key: "rmsPromedio", campo: "Sesion.rmsPromedio", width: 18, numFmt: "0.00" },
  { header: "Ángulo promedio (°)", key: "anguloPromedio", campo: "Sesion.anguloPromedio", width: 18, numFmt: "0.0" },
  { header: "Fuerza máxima (N)", key: "fuerzaMaxima", campo: "Sesion.fuerzaMaxima", width: 17, numFmt: "0.00" },
  { header: "Temperatura promedio (°C)", key: "temperaturaPromedio", campo: "Sesion.temperaturaPromedio", width: 22, numFmt: "0.0" },
  { header: "Registrada por", key: "registradaPor", campo: "Usuario.nombre (Sesion.registradaPorId)", width: 22 },
  { header: "Dispositivo", key: "dispositivo", campo: "Dispositivo.codigo (Sesion.dispositivoId)", width: 20 },
];

const COLUMNAS_PACIENTES = [
  { header: "ID paciente", key: "id", campo: "Paciente.id", width: 38 },
  { header: "Nombre", key: "nombre", campo: "Paciente.nombre", width: 26 },
  { header: "Edad", key: "edad", campo: "Paciente.edad", width: 8, numFmt: "0" },
  { header: "Sexo", key: "sexo", campo: "Paciente.sexo", width: 12 },
  { header: "Brazo", key: "brazo", campo: "Paciente.brazo", width: 12 },
  { header: "Terapia", key: "terapia", campo: "Paciente.terapia", width: 16 },
  { header: "Duración objetivo (min)", key: "duracionMin", campo: "Paciente.duracionMin", width: 22, numFmt: "0" },
  { header: "Observaciones", key: "observaciones", campo: "Paciente.observaciones", width: 40 },
  { header: "Fecha de registro", key: "creadoEn", campo: "Paciente.creadoEn", width: 18, numFmt: "dd/mm/yyyy hh:mm" },
  { header: "Responsable", key: "responsable", campo: "Usuario.nombre (Paciente.responsableId)", width: 22 },
  { header: "Sesiones exportadas", key: "sesionesExportadas", campo: "Conteo de filas en la hoja Sesiones", width: 19, numFmt: "0" },
];

function prepararHoja(ws, columnas) {
  ws.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: COLOR.headerText }, name: "Calibri", size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.ink } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "medium", color: { argb: COLOR.teal } } };
    // Nota con el nombre del campo en la base de datos (trazabilidad).
    cell.note = `Campo en la base de datos: ${columnas[i - 1].campo}`;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function finalizarHoja(ws, columnas, filas) {
  const ultima = Math.max(filas + 1, 1);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  // Ajuste de ancho según contenido (con límites razonables).
  ws.columns.forEach((col, i) => {
    let max = String(columnas[i].header).length;
    col.eachCell({ includeEmpty: false }, (cell, row) => {
      if (row === 1) return;
      const v = cell.value;
      const len = v instanceof Date ? 16 : v === null || v === undefined ? 0 : String(v).length;
      if (len > max) max = len;
    });
    col.width = Math.min(Math.max(max + 2, columnas[i].width * 0.6, 8), 60);
  });
  for (let r = 2; r <= ultima; r++) {
    if (r % 2 === 0) continue;
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.zebra } };
    });
  }
}

const ETIQUETAS_FILTRO = {
  desde: "Fecha inicial", hasta: "Fecha final", pacienteId: "Paciente", terapia: "Terapia", brazo: "Brazo",
  sexo: "Sexo", dispositivoId: "Dispositivo", usuarioId: "Registrada por", q: "Búsqueda",
};

/**
 * @param {object} p
 * @param {Array} p.sesiones   sesiones con include paciente, registradaPor, dispositivo
 * @param {Array} p.pacientes  pacientes a incluir en la hoja Pacientes
 * @param {object} p.filtros   filtros aplicados (legibles)
 * @param {object} p.usuario   usuario que exporta
 */
async function construirLibro({ sesiones, pacientes, filtros, usuario, alcance }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MOTRIX";
  wb.created = new Date();
  wb.title = "MOTRIX — Registros de sesiones";

  /* ---------- Hoja 1: Sesiones ---------- */
  const ws = wb.addWorksheet("Sesiones", { properties: { tabColor: { argb: COLOR.teal } } });
  prepararHoja(ws, COLUMNAS_SESIONES);
  for (const s of sesiones) {
    ws.addRow({
      fecha: toExcelLocal(s.fecha),
      id: s.id,
      pacienteId: s.pacienteId,
      pacienteNombre: s.pacienteNombre,
      edad: s.paciente?.edad ?? null,
      sexo: s.paciente?.sexo ?? null,
      brazo: s.paciente?.brazo ?? null,
      terapia: s.terapia ?? null,
      duracionSeg: s.duracionSeg,
      duracionMin: Math.round((s.duracionSeg / 60) * 100) / 100,
      repeticiones: s.repeticiones,
      rmsPromedio: s.rmsPromedio,
      anguloPromedio: s.anguloPromedio,
      fuerzaMaxima: s.fuerzaMaxima,
      temperaturaPromedio: s.temperaturaPromedio,
      registradaPor: s.registradaPor?.nombre ?? null,
      dispositivo: s.dispositivo ? `${s.dispositivo.codigo}` : null,
    });
  }
  finalizarHoja(ws, COLUMNAS_SESIONES, sesiones.length);

  /* ---------- Hoja 2: Pacientes ---------- */
  const conteo = sesiones.reduce((m, s) => m.set(s.pacienteId, (m.get(s.pacienteId) || 0) + 1), new Map());
  const wp = wb.addWorksheet("Pacientes");
  prepararHoja(wp, COLUMNAS_PACIENTES);
  for (const p of pacientes) {
    wp.addRow({
      id: p.id, nombre: p.nombre, edad: p.edad, sexo: p.sexo, brazo: p.brazo, terapia: p.terapia,
      duracionMin: p.duracionMin, observaciones: p.observaciones, creadoEn: toExcelLocal(p.creadoEn),
      responsable: p.responsable?.nombre ?? null, sesionesExportadas: conteo.get(p.id) || 0,
    });
  }
  wp.getColumn("observaciones").alignment = { wrapText: true, vertical: "top" };
  finalizarHoja(wp, COLUMNAS_PACIENTES, pacientes.length);

  /* ---------- Hoja 3: Información ---------- */
  const wi = wb.addWorksheet("Información");
  wi.columns = [{ width: 30 }, { width: 70 }];
  const titulo = wi.addRow(["MOTRIX — Exportación de registros"]);
  titulo.font = { bold: true, size: 14, color: { argb: COLOR.ink } };
  wi.addRow([]);
  const info = [
    ["Generado", toExcelLocal(new Date())],
    ["Zona horaria de las fechas", config.timezone],
    ["Exportado por", `${usuario.nombre} (${usuario.usuario}) · ${usuario.rol === "ADMIN" ? "Administrador" : "Usuario"}`],
    ["Alcance", alcance],
    ["Sesiones exportadas", sesiones.length],
    ["Pacientes en la hoja Pacientes", pacientes.length],
  ];
  const entradas = Object.entries(filtros.legibles || {});
  info.push(["Filtros aplicados", entradas.length ? "" : "Ninguno (todos los registros autorizados)"]);
  for (const [k, v] of entradas) info.push([`   · ${ETIQUETAS_FILTRO[k] || k}`, v]);
  info.push([]);
  info.push(["Nota", "Ángulo y temperatura en 0 suelen indicar que el dispositivo no envió ese dato durante la sesión (el firmware actual no publica esos sensores)."]);
  for (const fila of info) {
    const r = wi.addRow(fila);
    r.getCell(1).font = { bold: true, color: { argb: COLOR.ink } };
    if (fila[1] instanceof Date) r.getCell(2).numFmt = "dd/mm/yyyy hh:mm:ss";
    r.getCell(2).alignment = { wrapText: true, vertical: "top", horizontal: "left" };
  }

  return wb;
}

function nombreArchivo(filtrado) {
  const ahora = toExcelLocal(new Date());
  const stamp = ahora.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "_");
  return `motrix_sesiones_${filtrado ? "filtrado_" : ""}${stamp}.xlsx`;
}

module.exports = { construirLibro, nombreArchivo, COLUMNAS_SESIONES, COLUMNAS_PACIENTES, formatLocal };
