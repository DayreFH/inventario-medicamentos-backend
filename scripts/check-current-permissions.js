import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPermissions() {
  console.log('🔍 Verificando permisos actuales...\n');

  try {
    const users = await prisma.user.findMany({
      include: {
        role: true
      }
    });

    console.log(`👥 Usuarios en el sistema: ${users.length}\n`);

    users.forEach(user => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`👤 Usuario: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Rol: ${user.role?.name || 'Sin rol'}`);
      
      if (user.role?.permissions) {
        let perms = [];
        try {
          if (typeof user.role.permissions === 'string') {
            perms = JSON.parse(user.role.permissions);
          } else if (Array.isArray(user.role.permissions)) {
            perms = user.role.permissions;
          }
        } catch (e) {
          console.log(`   ⚠️ Error parseando permisos`);
        }
        
        console.log(`   Permisos (${perms.length}):`);
        perms.forEach(p => console.log(`      ✓ ${p}`));
      } else {
        console.log(`   ⚠️ Sin permisos asignados`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPermissions();

