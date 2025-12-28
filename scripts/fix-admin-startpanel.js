import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixAdminStartPanel() {
  console.log('🔧 Corrigiendo startPanel del rol Administrador...\n');

  try {
    // Buscar rol Administrador
    const adminRole = await prisma.roles.findFirst({
      where: { name: 'Administrador' }
    });

    if (!adminRole) {
      console.log('❌ No se encontró el rol Administrador');
      return;
    }

    console.log('📋 Rol Administrador actual:');
    console.log(`   ID: ${adminRole.id}`);
    console.log(`   startPanel: ${adminRole.startPanel}`);

    // Actualizar startPanel a /dashboard
    await prisma.roles.update({
      where: { id: adminRole.id },
      data: {
        startPanel: '/dashboard',
        updated_at: new Date()
      }
    });

    console.log('\n✅ startPanel actualizado a /dashboard');

    // Verificar
    const updated = await prisma.roles.findUnique({
      where: { id: adminRole.id }
    });

    console.log('\n📋 Verificación:');
    console.log(`   startPanel ahora es: ${updated.startPanel}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixAdminStartPanel();

