import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixAllUsersRoleId() {
  console.log('🔧 Corrigiendo roleId de todos los usuarios...\n');

  try {
    // 1. Verificar roles existentes
    console.log('1️⃣ Verificando roles existentes...');
    const roles = await prisma.roles.findMany();
    
    console.log(`   Total roles: ${roles.length}`);
    roles.forEach(role => {
      console.log(`   - [${role.id}] ${role.name}`);
    });
    console.log('');

    if (roles.length === 0) {
      console.log('   ⚠️  No hay roles. Creando rol Administrador...');
      const adminRole = await prisma.roles.create({
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
    }

    // 2. Obtener el rol Administrador
    const adminRole = await prisma.roles.findFirst({
      where: { name: 'Administrador' }
    });

    if (!adminRole) {
      console.log('   ❌ No se pudo encontrar el rol Administrador');
      return;
    }

    console.log(`2️⃣ Usando rol Administrador (ID: ${adminRole.id})\n`);

    // 3. Verificar usuarios actuales
    console.log('3️⃣ Usuarios actuales:');
    const usersBefore = await prisma.user.findMany({
      include: {
        roles: true
      },
      orderBy: { id: 'asc' }
    });

    console.log(`   Total: ${usersBefore.length}\n`);
    usersBefore.forEach(user => {
      const roleName = user.roles ? user.roles.name : 'SIN ROL';
      const roleIdStatus = user.roleId === adminRole.id ? '✅' : '⚠️';
      console.log(`   ${roleIdStatus} [${user.id}] ${user.name} (${user.email})`);
      console.log(`      roleId actual: ${user.roleId || 'NULL'} → Rol: ${roleName}`);
    });
    console.log('');

    // 4. Actualizar TODOS los usuarios al rol Administrador
    console.log('4️⃣ Actualizando todos los usuarios...');
    
    const updateResult = await prisma.user.updateMany({
      data: {
        roleId: adminRole.id
      }
    });

    console.log(`   ✅ ${updateResult.count} usuarios actualizados\n`);

    // 5. Verificar resultado final
    console.log('5️⃣ Verificación final:');
    const usersAfter = await prisma.user.findMany({
      include: {
        roles: true
      },
      orderBy: { id: 'asc' }
    });

    usersAfter.forEach(user => {
      console.log(`   ✅ [${user.id}] ${user.name} (${user.email})`);
      console.log(`      roleId: ${user.roleId} → Rol: ${user.roles.name}`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TODOS LOS USUARIOS AHORA TIENEN ROL ADMINISTRADOR');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixAllUsersRoleId()
  .catch(console.error);

