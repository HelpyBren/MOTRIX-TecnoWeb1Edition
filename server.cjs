require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api", (_req, res) => {
  res.json({ mensaje: "API de MOTRIX EMG funcionando correctamente" });
});

app.get("/api/pacientes", async (_req, res) => {
  try {
    res.json(await prisma.paciente.findMany({ orderBy: { creadoEn: "desc" } }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudieron consultar los pacientes" });
  }
});

app.post("/api/pacientes", async (req, res) => {
  try {
    const { nombre, edad, sexo, brazo, terapia, duracionMin, observaciones } = req.body || {};
    if (!String(nombre || "").trim() || !Number.isInteger(Number(edad)) || Number(edad) < 1 || Number(edad) > 120) {
      return res.status(400).json({ error: "El nombre y una edad válida (1 a 120) son obligatorios" });
    }
    const paciente = await prisma.paciente.create({
      data: {
        id: randomUUID(),
        nombre: String(nombre).trim(),
        edad: Number(edad),
        sexo: sexo || null,
        brazo: brazo || null,
        terapia: terapia || null,
        duracionMin: Number.isFinite(Number(duracionMin)) && Number(duracionMin) > 0 ? Number(duracionMin) : 20,
        observaciones: observaciones ? String(observaciones) : null,
      },
    });
    res.status(201).json(paciente);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo registrar el paciente" });
  }
});

app.put("/api/pacientes/:id", async (req, res) => {
  try {
    const { nombre, edad, sexo, brazo, terapia, duracionMin, observaciones } = req.body || {};
    if (!String(nombre || "").trim() || !Number.isInteger(Number(edad)) || Number(edad) < 1 || Number(edad) > 120) {
      return res.status(400).json({ error: "El nombre y una edad válida (1 a 120) son obligatorios" });
    }
    const paciente = await prisma.paciente.update({
      where: { id: req.params.id },
      data: {
        nombre: String(nombre).trim(), edad: Number(edad),
        sexo: sexo || null, brazo: brazo || null, terapia: terapia || null,
        duracionMin: Number(duracionMin) > 0 ? Number(duracionMin) : 20,
        observaciones: observaciones ? String(observaciones) : null,
      },
    });
    res.json(paciente);
  } catch (e) {
    console.error(e);
    res.status(e.code === "P2025" ? 404 : 500).json({ error: e.code === "P2025" ? "Paciente no encontrado" : "No se pudo actualizar el paciente" });
  }
});

app.delete("/api/pacientes/:id", async (req, res) => {
  try {
    await prisma.paciente.delete({ where: { id: req.params.id } });
    res.json({ mensaje: "Paciente y sesiones asociadas eliminados" });
  } catch (e) {
    console.error(e);
    res.status(e.code === "P2025" ? 404 : 500).json({ error: e.code === "P2025" ? "Paciente no encontrado" : "No se pudo eliminar el paciente" });
  }
});

app.get("/api/sesiones", async (_req, res) => {
  try {
    res.json(await prisma.sesion.findMany({ orderBy: { fecha: "desc" } }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudieron consultar las sesiones" });
  }
});

app.post("/api/sesiones", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.pacienteId || !b.pacienteNombre) {
      return res.status(400).json({ error: "El paciente es obligatorio para registrar una sesión" });
    }
    const nums = ["duracionSeg", "repeticiones", "rmsPromedio", "anguloPromedio", "fuerzaMaxima", "temperaturaPromedio"];
    for (const key of nums) {
      if (b[key] !== undefined && !Number.isFinite(Number(b[key]))) {
        return res.status(400).json({ error: `El campo ${key} debe ser numérico` });
      }
    }
    const paciente = await prisma.paciente.findUnique({ where: { id: String(b.pacienteId) } });
    if (!paciente) return res.status(400).json({ error: "El paciente no existe en SQLite. Selecciona o registra un paciente desde la base de datos." });
    const sesion = await prisma.sesion.create({
      data: {
        id: randomUUID(),
        pacienteId: paciente.id,
        pacienteNombre: paciente.nombre,
        terapia: b.terapia || paciente.terapia || null,
        duracionSeg: Math.max(0, Math.round(Number(b.duracionSeg || 0))),
        repeticiones: Math.max(0, Math.round(Number(b.repeticiones || 0))),
        rmsPromedio: Number(b.rmsPromedio || 0),
        anguloPromedio: Number(b.anguloPromedio || 0),
        fuerzaMaxima: Number(b.fuerzaMaxima || 0),
        temperaturaPromedio: Number(b.temperaturaPromedio || 0),
      },
    });
    res.status(201).json(sesion);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo registrar la sesión" });
  }
});

app.get("/api/dispositivos", async (_req, res) => {
  try { res.json(await prisma.dispositivo.findMany({ orderBy: { id: "desc" } })); }
  catch (e) { console.error(e); res.status(500).json({ error: "No se pudieron consultar los dispositivos" }); }
});
app.post("/api/dispositivos", async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    if (!nombre) return res.status(400).json({ error: "El nombre del dispositivo es obligatorio" });
    const dispositivo = await prisma.dispositivo.create({ data: { nombre, estado: req.body.estado || "Desconectado" } });
    res.status(201).json(dispositivo);
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo registrar el dispositivo" }); }
});

app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
const server = app.listen(PORT, () => console.log(`MOTRIX EMG API disponible en http://localhost:${PORT}`));
process.on("SIGINT", async () => { await prisma.$disconnect(); server.close(() => process.exit(0)); });
process.on("SIGTERM", async () => { await prisma.$disconnect(); server.close(() => process.exit(0)); });
