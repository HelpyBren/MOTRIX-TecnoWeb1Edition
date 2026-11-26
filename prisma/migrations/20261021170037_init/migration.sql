-- CreateTable
CREATE TABLE "Paciente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "edad" INTEGER NOT NULL,
    "sexo" TEXT,
    "brazo" TEXT,
    "terapia" TEXT,
    "duracionMin" INTEGER NOT NULL DEFAULT 20,
    "observaciones" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Sesion" (
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
    CONSTRAINT "Sesion_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dispositivo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Desconectado',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
