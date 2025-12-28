import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkLocalDatabase() {
  console.log('\n📊 ANÁLISIS DE BASE DE DATOS LOCAL');
  console.log('='.repeat(60));

  try {
    // 1. Verificar roles
    console.log('\n1️⃣ ROLES EN BASE DE DATOS LOCAL:');
    const roles = await prisma.roles.findMany({
      orderBy: { id: 'asc' }
    });

    if (roles.length === 0) {
      console.log('   ⚠️  No hay roles');
    } else {
      console.log(`   Total: ${roles.length}\n`);
      roles.forEach(role => {
        console.log(`   📋 [${role.id}] ${role.name}`);
        console.log(`      Descripción: ${role.description || 'N/A'}`);
        console.log(`      Creado: ${role.created_at}`);
        console.log('');
      });
    }

    // 2. Verificar usuarios
    console.log('\n2️⃣ USUARIOS EN BASE DE DATOS LOCAL:');
    const users = await prisma.user.findMany({
      include: {
        roles: true
      },
      orderBy: { id: 'asc' }
    });

    if (users.length === 0) {
      console.log('   ⚠️  No hay usuarios');
    } else {
      console.log(`   Total: ${users.length}\n`);
      users.forEach(user => {
        console.log(`   👤 [${user.id}] ${user.name}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      Rol: ${user.roles ? user.roles.name : 'SIN ROL'} (roleId: ${user.roleId || 'NULL'})`);
        console.log(`      Creado: ${user.created_at}`);
        console.log('');
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Análisis completado');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkLocalDatabase()
  .catch(console.error);

