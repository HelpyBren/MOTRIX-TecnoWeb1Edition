const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSQLite3 } = require('@prisma/adapter-better-sqlite3');
const { hash } = require('bcrypt');

const prisma = new PrismaClient({
  adapter: new PrismaBetterSQLite3({ url: 'file:./prisma/dev.db' }, { timestampFormat: 'unixepoch-ms' })
});

async function createAdmin() {
  const username = 'admin';
  const email = 'admin@motrix.com';
  const password = 'admin123'; // Change this!
  const hashedPassword = await hash(password, 10);

  try {
    const user = await prisma.usuario.create({
      data: {
        nombre: 'Administrador',
        usuario: username,
        correo: email,
        passwordHash: hashedPassword,
        rol: 'admin',
        activo: true
      }
    });

    console.log('✅ Admin user created!');
    console.log('   - Username:', username);
    console.log('   - Email:', email);
    console.log('   - Password:', password);
    console.log('\nUse these credentials to login.');

  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    if (error.code === 'P2002') {
      console.log('   Username or email already exists.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();