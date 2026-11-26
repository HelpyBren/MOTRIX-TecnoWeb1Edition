/* ======================================================================
   MOTRIX — Pruebas de integración de la API
   Se ejecutan sobre una COPIA de la base de datos original (con la
   migración aplicada), un broker MQTT local (aedes) y una ESP32 simulada.
   npm test
   ====================================================================== */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { execFileSync } = require("child_process");

const raiz = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "motrix-test-"));
const dbPath = path.join(tmp, "prueba.db");
const original = fs.readdirSync(path.join(raiz, "prisma", "backups")).filter((f) => f.startsWith("dev.original")).sort().pop();
fs.copyFileSync(path.join(raiz, "prisma", "backups", original), dbPath);

process.env.DATABASE_URL = `file:${dbPath}`;
process.env.DEVICE_MASTER_KEY = "clave-maestra-de-pruebas-0123456789abcdef";
process.env.NODE_ENV = "test";
process.env.DOTENV_PATH = path.join(tmp, "no-existe.env");

execFileSync(process.execPath, [path.join(raiz, "scripts", "migrate.js")], { env: process.env, stdio: "pipe" });

const { prisma } = require("../server/db");
const { hashPassword } = require("../server/utils/security");
const { createApp } = require("../server/app");
const { bridge } = require("../server/services/mqttBridge");
const deviceCrypto = require("../server/services/deviceCrypto");

let base, server, broker, brokerServer, mqttPort;
const H = { "Content-Type": "application/json", "X-Requested-With": "MotrixWeb" };

function libre() {
  return new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

class Cliente {
  constructor() { this.cookie = ""; }
  async req(metodo, ruta, body, { headers = H } = {}) {
    const r = await fetch(base + ruta, {
      method: metodo, headers: { ...headers, ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual",
    });
    const sets = r.headers.getSetCookie();
    if (sets.length) { const ultima = sets[sets.length - 1].split(";")[0]; this.cookie = ultima.endsWith("=") ? "" : ultima; }
    const tipo = r.headers.get("content-type") || "";
    const datos = tipo.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, datos, headers: r.headers };
  }
  get(r) { return this.req("GET", r); }
  post(r, b = {}) { return this.req("POST", r, b); }
  put(r, b = {}) { return this.req("PUT", r, b); }
  del(r) { return this.req("DELETE", r); }
  async login(identificador, password) { return this.post("/api/auth/login", { identificador, password }); }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(async () => {
  await prisma.usuario.create({ data: { nombre: "Admin Prueba", usuario: "admin", correo: "admin@prueba.bo", rol: "ADMIN", passwordHash: await hashPassword("AdminSegura1") } });
  await prisma.usuario.create({ data: { nombre: "Fisio Uno", usuario: "fisio1", correo: "fisio1@prueba.bo", rol: "USUARIO", passwordHash: await hashPassword("FisioSegura1") } });
  await prisma.usuario.create({ data: { nombre: "Fisio Dos", usuario: "fisio2", correo: "fisio2@prueba.bo", rol: "USUARIO", passwordHash: await hashPassword("FisioSegura2") } });

  mqttPort = await libre();
  broker = require("aedes")();
  brokerServer = net.createServer(broker.handle);
  await new Promise((r) => brokerServer.listen(mqttPort, r));
  bridge.iniciar({ url: `mqtt://127.0.0.1:${mqttPort}`, username: "", password: "" });

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (let i = 0; i < 50 && !bridge.conectado; i++) await esperar(50);
});

test.after(async () => {
  await bridge.detener();
  server.close();
  brokerServer.close();
  await new Promise((r) => broker.close(r));
  await prisma.$disconnect();
});

test("la migración conserva los datos existentes", async () => {
  assert.strictEqual(await prisma.paciente.count(), 27);
  assert.strictEqual(await prisma.sesion.count(), 25);
  const s = await prisma.sesion.findFirst({ orderBy: { fecha: "asc" } });
  assert.ok(s.fecha instanceof Date && s.fecha.getFullYear() === 2026, "las fechas en epoch ms se leen correctamente");
});

test("las rutas protegidas exigen sesión y los archivos internos no se sirven", async () => {
  const c = new Cliente();
  assert.strictEqual((await c.get("/api/pacientes")).status, 401);
  assert.strictEqual((await c.get("/api/exportar/sesiones.xlsx")).status, 401);
  const pagina = await c.get("/dashboard.html");
  assert.strictEqual(pagina.status, 302);
  assert.match(pagina.headers.get("location"), /login\.html/);
  for (const ruta of ["/.env", "/prisma/dev.db", "/server/app.js", "/package.json"]) {
    assert.strictEqual((await c.get(ruta)).status, 404, ruta);
  }
});

test("login: credenciales, cabecera anti-CSRF, cookie segura y bloqueo", async () => {
  const c = new Cliente();
  const sinCabecera = await c.req("POST", "/api/auth/login", { identificador: "admin", password: "AdminSegura1" }, { headers: { "Content-Type": "application/json" } });
  assert.strictEqual(sinCabecera.status, 403);

  const mal = await c.login("admin", "incorrecta");
  assert.strictEqual(mal.status, 401);
  assert.strictEqual(mal.datos.error, "Usuario o contraseña incorrectos.");
  const inexistente = await c.login("nadie", "incorrecta");
  assert.strictEqual(inexistente.datos.error, mal.datos.error, "no se revela si el usuario existe");

  const ok = await c.login("ADMIN@prueba.bo", "AdminSegura1");
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.datos.usuario.rol, "ADMIN");
  assert.ok(!("passwordHash" in ok.datos.usuario));
  const cookie = ok.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const guardada = await prisma.sesionAcceso.findFirst();
  assert.ok(!cookie.includes(guardada.tokenHash), "en la base solo se guarda el hash del token");

  const bloq = new Cliente();
  for (let i = 0; i < 5; i++) await bloq.login("fisio2", "mala");
  const r = await bloq.login("fisio2", "FisioSegura2");
  assert.strictEqual(r.status, 423, "la cuenta queda bloqueada temporalmente");
  await prisma.usuario.update({ where: { usuario: "fisio2" }, data: { bloqueadoHasta: null, intentosFallidos: 0 } });

  assert.strictEqual((await c.post("/api/auth/logout")).status, 200);
  assert.strictEqual((await c.get("/api/auth/me")).status, 401);
});

test("roles: un usuario solo ve sus pacientes y no administra", async () => {
  const f1 = new Cliente(); await f1.login("fisio1", "FisioSegura1");
  const f2 = new Cliente(); await f2.login("fisio2", "FisioSegura2");
  const admin = new Cliente(); await admin.login("admin", "AdminSegura1");

  assert.strictEqual((await f1.get("/api/pacientes")).datos.length, 0, "los registros históricos sin responsable son solo del admin");
  assert.strictEqual((await admin.get("/api/pacientes")).datos.length, 27);

  const nuevo = await f1.post("/api/pacientes", { nombre: "Paciente Prueba", edad: 40, terapia: "Flexión", responsableId: "otro" });
  assert.strictEqual(nuevo.status, 201);
  assert.strictEqual(nuevo.datos.responsableId, (await prisma.usuario.findUnique({ where: { usuario: "fisio1" } })).id, "un usuario no puede asignar otro responsable");

  assert.strictEqual((await f2.get(`/api/pacientes/${nuevo.datos.id}`)).status, 404);
  assert.strictEqual((await f2.put(`/api/pacientes/${nuevo.datos.id}`, { nombre: "X", edad: 3 })).status, 404);
  assert.strictEqual((await f2.post("/api/sesiones", { pacienteId: nuevo.datos.id })).status, 400);
  assert.strictEqual((await f1.del(`/api/pacientes/${nuevo.datos.id}`)).status, 403, "solo el admin elimina");
  assert.strictEqual((await f1.get("/api/usuarios")).status, 403);
  assert.strictEqual((await f1.post("/api/dispositivos", { nombre: "x", codigo: "abc" })).status, 403);
  assert.strictEqual((await f1.get("/api/sesiones?usuarioId=ninguno")).status, 403);

  const ses = await f1.post("/api/sesiones", { pacienteId: nuevo.datos.id, duracionSeg: 600, repeticiones: 12, rmsPromedio: 140.5, fuerzaMaxima: 6.2 });
  assert.strictEqual(ses.status, 201);
  assert.strictEqual(ses.datos.pacienteNombre, "Paciente Prueba");
  assert.strictEqual((await f1.get("/api/sesiones")).datos.length, 1);
  assert.strictEqual((await f2.get("/api/sesiones")).datos.length, 0);
  assert.strictEqual((await admin.get("/api/sesiones")).datos.length, 26);
  const bad = await f1.post("/api/sesiones", { pacienteId: nuevo.datos.id, duracionSeg: "abc" });
  assert.strictEqual(bad.status, 400);
});

test("exportación a Excel: archivo real, filtros y permisos", async () => {
  const ExcelJS = require("exceljs");
  const admin = new Cliente(); await admin.login("admin", "AdminSegura1");
  const f1 = new Cliente(); await f1.login("fisio1", "FisioSegura1");

  const todo = await admin.get("/api/exportar/sesiones.xlsx");
  assert.strictEqual(todo.status, 200);
  assert.match(todo.headers.get("content-type"), /spreadsheetml/);
  assert.match(todo.headers.get("content-disposition"), /attachment; filename="motrix_sesiones_\d{8}_\d{4}\.xlsx"/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(todo.datos);
  assert.deepStrictEqual(wb.worksheets.map((w) => w.name), ["Sesiones", "Pacientes", "Información"]);
  const ws = wb.getWorksheet("Sesiones");
  assert.strictEqual(ws.rowCount, 1 + 26);
  assert.strictEqual(ws.getCell("A1").value, "Fecha y hora");
  assert.ok(ws.getCell("A2").value instanceof Date, "las fechas son fechas de Excel");
  assert.strictEqual(typeof ws.getCell("I2").value, "number", "la duración es numérica");
  assert.ok(ws.autoFilter, "tiene filtro automático");
  assert.strictEqual(wb.getWorksheet("Pacientes").rowCount, 1 + 28);

  // Filtro por fecha: coincide con la consulta de la API.
  const q = "desde=2026-10-22&hasta=2026-10-22&terapia=Flexi%C3%B3n";
  const api = await admin.get(`/api/sesiones?${q}`);
  const filtrado = await admin.get(`/api/exportar/sesiones.xlsx?${q}`);
  const wf = new ExcelJS.Workbook();
  await wf.xlsx.load(filtrado.datos);
  assert.ok(api.datos.length > 0);
  assert.strictEqual(wf.getWorksheet("Sesiones").rowCount - 1, api.datos.length);
  assert.match(filtrado.headers.get("content-disposition"), /filtrado/);
  const ids = new Set(api.datos.map((s) => s.id));
  wf.getWorksheet("Sesiones").eachRow((row, n) => { if (n > 1) assert.ok(ids.has(row.getCell(2).value)); });

  // Un usuario solo exporta lo suyo.
  const propio = await f1.get("/api/exportar/sesiones.xlsx");
  const wp = new ExcelJS.Workbook();
  await wp.xlsx.load(propio.datos);
  assert.strictEqual(wp.getWorksheet("Sesiones").rowCount, 2);
  assert.strictEqual(wp.getWorksheet("Sesiones").getCell("D2").value, "Paciente Prueba");

  const auditada = await prisma.auditoria.count({ where: { accion: "exportacion_excel" } });
  assert.strictEqual(auditada, 3);
});

test("recuperación de contraseña: token de un solo uso", async () => {
  const c = new Cliente();
  const r1 = await c.post("/api/auth/recuperar", { correo: "fisio1@prueba.bo" });
  const r2 = await c.post("/api/auth/recuperar", { correo: "noexiste@prueba.bo" });
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r1.datos.mensaje, r2.datos.mensaje, "misma respuesta exista o no la cuenta");

  // El enlace real se envía por correo; aquí lo genera un administrador.
  const admin = new Cliente(); await admin.login("admin", "AdminSegura1");
  const u = await prisma.usuario.findUnique({ where: { usuario: "fisio1" } });
  const { datos } = await admin.post(`/api/usuarios/${u.id}/enlace-restablecer`);
  const token = new URL(datos.enlace).hash.replace("#token=", "");
  assert.strictEqual((await c.post("/api/auth/restablecer", { token, password: "corta" })).status, 400);
  assert.strictEqual((await c.post("/api/auth/restablecer", { token, password: "NuevaClave2026" })).status, 200);
  assert.strictEqual((await c.post("/api/auth/restablecer", { token, password: "OtraClave2026" })).status, 400, "no se puede reutilizar");
  assert.strictEqual((await c.login("fisio1", "FisioSegura1")).status, 401);
  assert.strictEqual((await c.login("fisio1", "NuevaClave2026")).status, 200);
});

test("dispositivos: estado por MQTT, telemetría y cambio de WiFi firmado", async () => {
  const mqtt = require("mqtt");
  const admin = new Cliente(); await admin.login("admin", "AdminSegura1");
  const alta = await admin.post("/api/dispositivos", { nombre: "Equipo de prueba", codigo: "MOTRIX-T1", topicBase: "pruebaT1" });
  assert.strictEqual(alta.status, 201);
  assert.strictEqual(alta.datos.enLinea, false);

  const clave = await admin.post(`/api/dispositivos/${alta.datos.id}/clave`, { password: "AdminSegura1" });
  assert.strictEqual(clave.status, 200);
  assert.match(clave.datos.snippet, /#define DEVICE_KEY  "[0-9a-f]{64}"/);
  assert.strictEqual((await admin.post(`/api/dispositivos/${alta.datos.id}/clave`, { password: "mala" })).status, 400);

  // ESP32 simulada
  const key = Buffer.from(clave.datos.clave, "hex");
  const esp = mqtt.connect(`mqtt://127.0.0.1:${mqttPort}`, {
    clientId: "esp-prueba", reconnectPeriod: 0,
    will: { topic: "motrix/dispositivos/MOTRIX-T1/estado", payload: JSON.stringify({ online: false }), retain: true, qos: 1 },
  });
  await new Promise((r) => esp.on("connect", r));
  const recibidos = [];
  esp.subscribe(["motrix/dispositivos/MOTRIX-T1/cmd", "motrix/pruebaT1/start"]);
  esp.on("message", (t, m) => recibidos.push({ t, m: m.toString() }));
  esp.publish("motrix/dispositivos/MOTRIX-T1/estado", JSON.stringify({ online: true, fw: "2.0.0", ip: "10.0.0.9", ssid: "RedVieja", rssi: -61, topic: "pruebaT1" }), { retain: true });
  esp.publish("motrix/pruebaT1/rssi", "-61");
  await esperar(400);

  const lista = await admin.get("/api/dispositivos");
  const d = lista.datos.dispositivos.find((x) => x.codigo === "MOTRIX-T1");
  assert.strictEqual(d.enLinea, true);
  assert.strictEqual(d.ssid, "RedVieja");

  // Telemetría por SSE
  const ctrl = new AbortController();
  const sse = await fetch(`${base}/api/tiempo-real/stream?topicBase=pruebaT1`, { headers: { Cookie: admin.cookie }, signal: ctrl.signal });
  assert.strictEqual(sse.status, 200);
  const lector = sse.body.getReader();
  setTimeout(() => esp.publish("motrix/pruebaT1/emg", "123.4"), 150);
  let texto = "";
  const limite = Date.now() + 3000;
  while (!texto.includes("123.4") && Date.now() < limite) texto += new TextDecoder().decode((await lector.read()).value);
  ctrl.abort();
  assert.match(texto, /"k":"emg","v":"123.4"/);

  // Comando de terapia validado
  assert.strictEqual((await admin.post("/api/tiempo-real/comando", { topicBase: "pruebaT1", accion: "start", terapia: "rm -rf" })).status, 400);
  assert.strictEqual((await admin.post("/api/tiempo-real/comando", { topicBase: "motrix/#", accion: "stop" })).status, 400);
  assert.strictEqual((await admin.post("/api/tiempo-real/comando", { topicBase: "pruebaT1", accion: "start", terapia: "pronacion", minutos: 15 })).status, 200);

  // Cambio de WiFi
  const ssid = "Clínica Norte";
  const password = "contraseña-secreta-99";
  assert.strictEqual((await admin.post(`/api/dispositivos/${d.id}/wifi`, { ssid, password: "corta" })).status, 400);
  const w = await admin.post(`/api/dispositivos/${d.id}/wifi`, { ssid, password });
  assert.strictEqual(w.status, 202);
  await esperar(300);
  assert.ok(recibidos.some((x) => x.t === "motrix/pruebaT1/start" && x.m === "pronacion|15"));
  const cmdMsg = recibidos.find((x) => x.t.endsWith("/cmd"));
  assert.ok(cmdMsg, "la ESP32 recibe el comando");
  assert.ok(!cmdMsg.m.includes(password), "la contraseña no viaja en texto plano");
  const cmd = JSON.parse(cmdMsg.m);
  const v = deviceCrypto.verificarComando(cmd, key);
  assert.ok(v.ok);
  assert.strictEqual(v.password, password);
  assert.strictEqual(deviceCrypto.verificarComando({ ...cmd, s: "Otra red" }, key).ok, false);
  assert.strictEqual(deviceCrypto.verificarComando(cmd, key, { ahora: cmd.t + 3600 }).motivo, "tiempo");

  esp.publish("motrix/dispositivos/MOTRIX-T1/wifi", JSON.stringify({ ok: true, ssid, msg: `Conectado a ${ssid}` }));
  await esperar(300);
  const tras = (await admin.get("/api/dispositivos")).datos.dispositivos.find((x) => x.codigo === "MOTRIX-T1");
  assert.strictEqual(tras.wifiEstado, "ok");
  assert.strictEqual(tras.ssid, ssid);

  // La contraseña WiFi no queda en la base de datos ni en la auditoría.
  await prisma.$disconnect();
  const bytes = fs.readFileSync(dbPath);
  const wal = fs.existsSync(`${dbPath}-wal`) ? fs.readFileSync(`${dbPath}-wal`) : Buffer.alloc(0);
  assert.ok(!bytes.includes(Buffer.from(password)) && !wal.includes(Buffer.from(password)));

  // LWT: si la ESP32 se apaga de golpe, el broker publica su "última voluntad".
  esp.stream.destroy();
  await esperar(500);
  const fuera = (await admin.get("/api/dispositivos")).datos.dispositivos.find((x) => x.codigo === "MOTRIX-T1");
  assert.strictEqual(fuera.enLinea, false);
});

test("estadísticas: solo datos reales dentro del alcance", async () => {
  const admin = new Cliente(); await admin.login("admin", "AdminSegura1");
  const r = await admin.get("/api/estadisticas/resumen?desde=2026-10-01&hasta=2026-11-30");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.datos.totales.sesiones, 26);
  assert.strictEqual(r.datos.porDia.reduce((a, d) => a + d.sesiones, 0), 26);
  const f1 = new Cliente(); await f1.login("fisio1", "NuevaClave2026");
  const r1 = await f1.get("/api/estadisticas/resumen");
  assert.strictEqual(r1.datos.totales.sesiones, 1);
  assert.strictEqual(r1.datos.totales.pacientes, 1);
});
