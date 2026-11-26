const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSQLite3 } = require('@prisma/adapter-better-sqlite3');

const prisma = new PrismaClient({
  adapter: new PrismaBetterSQLite3({ url: 'file:./prisma/dev.db' }, { timestampFormat: 'unixepoch-ms' })
});

async function checkData() {
  try {
    const pacientes = await prisma.paciente.count();
    const sesiones = await prisma.sesion.count();
    const usuarios = await prisma.usuario.count();
    const dispositivos = await prisma.dispositivo.count();

    console.log('✅ Database has data:');
    console.log('   - Pacientes:', pacientes);
    console.log('   - Sesiones:', sesiones);
    console.log('   - Usuarios:', usuarios);
    console.log('   - Dispositivos:', dispositivos);

    if (pacientes > 0 || sesiones > 0) {
      console.log('\n🎉 Data restored successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error accessing database:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();