/* ======================================================================
   MOTRIX — Zona horaria de la aplicación (APP_TIMEZONE).
   Las fechas se guardan en UTC; los filtros por día y el Excel se
   interpretan en la zona horaria configurada (por defecto America/La_Paz).
   ====================================================================== */
"use strict";

const config = require("../config.cjs");

/** Diferencia (ms) entre la hora local de `tz` y UTC en el instante `date`. */
function tzOffsetMs(date, tz = config.timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-11-23" en la zona de la app → instante UTC del inicio (o final) de ese día. */
function localDayToUtc(ymd, endOfDay = false, tz = config.timezone) {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  const offset = tzOffsetMs(new Date(guess), tz);
  return new Date(guess - offset);
}

/**
 * Excel no guarda zona horaria: se escribe la hora local como si fuera UTC
 * para que la celda muestre exactamente la hora local de la clínica.
 */
function toExcelLocal(date, tz = config.timezone) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getTime() + tzOffsetMs(d, tz));
}

function formatLocal(date, tz = config.timezone) {
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: tz, dateStyle: "short", timeStyle: "short",
  }).format(date instanceof Date ? date : new Date(date));
}

module.exports = { tzOffsetMs, localDayToUtc, toExcelLocal, formatLocal };
