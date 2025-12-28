import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdminUser() {
  console.log('🔧 Creando usuario administrador...\n');

  try {
    // 1. Verificar si existe el rol Administrador
    console.log('1️⃣ Buscando rol Administrador...');
    let adminRole = await prisma.roles.findFirst({
      where: { name: 'Administrador' }
    });

    if (!adminRole) {
      console.log('   ⚠️  Rol Administrador no existe. Creándolo...');
      adminRole = await prisma.roles.create({
        data: {
          name: 'Administrador',
          updated_at: new Date(),
          permissions: {
            users: { view: true, create: true, edit: true, delete: true },
            medicines: { view: true, create: true, edit: true, delete: true },
            entries: { view: true, create: true, edit: true, delete: true },
            sales: { view: true, create: true, edit: true, delete: true },
            customers: { view: true, create: true, edit: true, delete: true },
            suppliers: { view: true, create: true, edit: true, delete: true },
            reports: { view: true, create: true, edit: true, delete: true },
            settings: { view: true, create: true, edit: true, delete: true }
          }
        }
      });
      console.log(`   ✅ Rol Administrador creado (ID: ${adminRole.id})\n`);
    } else {
      console.log(`   ✅ Rol Administrador encontrado (ID: ${adminRole.id})\n`);
    }

    // 2. Verificar si el usuario admin ya existe
    const email = 'admin@medilink.com';
    const password = 'Admin123!';

    console.log('2️⃣ Verificando si el usuario admin existe...');
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      console.log('   ⚠️  Usuario ya existe. Actualizando contraseña...');
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await prisma.user.update({
        where: { email },
        data: {
          password: hashedPassword,
          roleId: adminRole.id,
          isActive: true
        }
      });
      
      console.log('   ✅ Usuario actualizado\n');
    } else {
      console.log('   ℹ️  Usuario no existe. Creándolo...');
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: 'Administrador',
          roleId: adminRole.id,
          isActive: true
        }
      });
      
      console.log('   ✅ Usuario creado\n');
    }

    // 3. Mostrar credenciales
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ CREDENCIALES DE ACCESO:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 Email:    ${email}`);
    console.log(`🔑 Password: ${password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 4. Verificar todos los usuarios
    console.log('4️⃣ Usuarios en la base de datos:');
    const allUsers = await prisma.user.findMany({
      include: {
        roles: true
      }
    });

    allUsers.forEach(user => {
      console.log(`   - ${user.name} (${user.email})`);
      console.log(`     Rol: ${user.roles ? user.roles.name : 'SIN ROL'}`);
      console.log(`     Activo: ${user.isActive ? 'Sí' : 'No'}`);
      console.log('');
    });

    console.log('✅ ¡Proceso completado exitosamente!');
    console.log('\n💡 Ahora puedes iniciar sesión con las credenciales mostradas arriba.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser()
  .catch(console.error);

