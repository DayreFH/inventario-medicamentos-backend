import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixRailwayRoles() {
  console.log('🔧 Verificando y corrigiendo roles en Railway...\n');

  try {
    // 1. Verificar si existe la tabla roles
    console.log('1️⃣ Verificando tabla roles...');
    const rolesCount = await prisma.roles.count();
    console.log(`   ✅ Tabla roles existe. Total: ${rolesCount} roles\n`);

    // 2. Verificar roles existentes
    console.log('2️⃣ Roles existentes:');
    const roles = await prisma.roles.findMany();
    roles.forEach(role => {
      console.log(`   - ${role.name} (ID: ${role.id})`);
    });
    console.log('');

    // 3. Crear rol Administrador si no existe
    let adminRole = await prisma.roles.findFirst({
      where: { name: 'Administrador' }
    });

    if (!adminRole) {
      console.log('3️⃣ Creando rol Administrador...');
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
      console.log(`3️⃣ Rol Administrador ya existe (ID: ${adminRole.id})\n`);
    }

    // 4. Verificar usuarios
    console.log('4️⃣ Verificando usuarios...');
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true
      }
    });

    console.log(`   Total usuarios: ${users.length}`);
    users.forEach(user => {
      console.log(`   - ${user.name} (${user.email}) - roleId: ${user.roleId || 'NULL'}`);
    });
    console.log('');

    // 5. Asignar rol Administrador a usuarios sin roleId
    const usersWithoutRole = users.filter(u => !u.roleId);
    
    if (usersWithoutRole.length > 0) {
      console.log('5️⃣ Asignando rol Administrador a usuarios sin roleId...');
      
      for (const user of usersWithoutRole) {
        await prisma.user.update({
          where: { id: user.id },
          data: { roleId: adminRole.id }
        });
        console.log(`   ✅ ${user.name} ahora tiene roleId: ${adminRole.id}`);
      }
      console.log('');
    } else {
      console.log('5️⃣ Todos los usuarios tienen roleId asignado ✅\n');
    }

    // 6. Verificación final
    console.log('6️⃣ Verificación final:');
    const finalUsers = await prisma.user.findMany({
      include: {
        roles: true
      }
    });

    finalUsers.forEach(user => {
      console.log(`   - ${user.name}: ${user.roles ? user.roles.name : 'SIN ROL'}`);
    });

    console.log('\n✅ ¡Proceso completado exitosamente!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixRailwayRoles()
  .catch(console.error);

