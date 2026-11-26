-- MOTRIX — Migración: autenticación, roles, auditoría y dispositivos ESP32.
-- Segura para datos existentes: copia todas las filas de Paciente, Sesion y
-- Dispositivo; las columnas nuevas son opcionales o tienen valor por defecto.

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'USUARIO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" DATETIME,
    "ultimoAcceso" DATETIME,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SesionAcceso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" DATETIME NOT NULL,
    "ultimoUso" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "agente" TEXT,
    CONSTRAINT "SesionAcceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenRecuperacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" DATETIME NOT NULL,
    "usadoEn" DATETIME,
    CONSTRAINT "TokenRecuperacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "detalle" TEXT,
    "ip" TEXT,
    CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Dispositivo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Desconectado',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo" TEXT NOT NULL,
    "topicBase" TEXT NOT NULL DEFAULT 'paciente1',
    "descripcion" TEXT,
    "ubicacion" TEXT,
    "ultimaConexion" DATETIME,
    "ultimoRssi" INTEGER,
    "ip" TEXT,
    "ssid" TEXT,
    "mac" TEXT,
    "firmware" TEXT,
    "wifiEstado" TEXT,
    "wifiMensaje" TEXT,
    "wifiActualizadoEn" DATETIME,
    "actualizadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Dispositivo" ("id", "nombre", "estado", "creadoEn", "codigo", "actualizadoEn")
    SELECT "id", "nombre", "estado", "creadoEn", 'ESP32-' || "id", "creadoEn" FROM "Dispositivo";
DROP TABLE "Dispositivo";
ALTER TABLE "new_Dispositivo" RENAME TO "Dispositivo";
CREATE UNIQUE INDEX "Dispositivo_codigo_key" ON "Dispositivo"("codigo");

CREATE TABLE "new_Paciente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "edad" INTEGER NOT NULL,
    "sexo" TEXT,
    "brazo" TEXT,
    "terapia" TEXT,
    "duracionMin" INTEGER NOT NULL DEFAULT 20,
    "observaciones" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsableId" TEXT,
    CONSTRAINT "Paciente_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Paciente" ("brazo", "creadoEn", "duracionMin", "edad", "id", "nombre", "observaciones", "sexo", "terapia")
    SELECT "brazo", "creadoEn", "duracionMin", "edad", "id", "nombre", "observaciones", "sexo", "terapia" FROM "Paciente";
DROP TABLE "Paciente";
ALTER TABLE "new_Paciente" RENAME TO "Paciente";
CREATE INDEX "Paciente_responsableId_idx" ON "Paciente"("responsableId");

CREATE TABLE "new_Sesion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pacienteId" TEXT NOT NULL,
    "pacienteNombre" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terapia" TEXT,
    "duracionSeg" INTEGER NOT NULL DEFAULT 0,
    "repeticiones" INTEGER NOT NULL DEFAULT 0,
    "rmsPromedio" REAL NOT NULL DEFAULT 0,
    "anguloPromedio" REAL NOT NULL DEFAULT 0,
    "fuerzaMaxima" REAL NOT NULL DEFAULT 0,
    "temperaturaPromedio" REAL NOT NULL DEFAULT 0,
    "registradaPorId" TEXT,
    "dispositivoId" INTEGER,
    CONSTRAINT "Sesion_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Sesion_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sesion_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sesion" ("anguloPromedio", "duracionSeg", "fecha", "fuerzaMaxima", "id", "pacienteId", "pacienteNombre", "repeticiones", "rmsPromedio", "temperaturaPromedio", "terapia")
    SELECT "anguloPromedio", "duracionSeg", "fecha", "fuerzaMaxima", "id", "pacienteId", "pacienteNombre", "repeticiones", "rmsPromedio", "temperaturaPromedio", "terapia" FROM "Sesion";
DROP TABLE "Sesion";
ALTER TABLE "new_Sesion" RENAME TO "Sesion";
CREATE INDEX "Sesion_fecha_idx" ON "Sesion"("fecha");
CREATE INDEX "Sesion_pacienteId_idx" ON "Sesion"("pacienteId");
CREATE INDEX "Sesion_registradaPorId_idx" ON "Sesion"("registradaPorId");
CREATE INDEX "Sesion_dispositivoId_idx" ON "Sesion"("dispositivoId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "Usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "SesionAcceso_tokenHash_key" ON "SesionAcceso"("tokenHash");

-- CreateIndex
CREATE INDEX "SesionAcceso_usuarioId_idx" ON "SesionAcceso"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenRecuperacion_tokenHash_key" ON "TokenRecuperacion"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenRecuperacion_usuarioId_idx" ON "TokenRecuperacion"("usuarioId");

-- CreateIndex
CREATE INDEX "Auditoria_fecha_idx" ON "Auditoria"("fecha");
