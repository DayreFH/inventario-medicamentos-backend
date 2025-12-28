import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixVendedorStartPanel() {
  try {
    console.log('\n=== ACTUALIZANDO ROL VENDEDOR ===\n');
    
    // Actualizar el rol Vendedor
    const updated = await prisma.role.update({
      where: { name: 'Vendedor' },
      data: {
        startPanel: '/sales'
      }
    });

    console.log('✅ Rol Vendedor actualizado:');
    console.log('  - Nombre:', updated.name);
    console.log('  - Panel inicial:', updated.startPanel);
    console.log('  - Permisos:', updated.permissions);
    
    console.log('\n✅ CAMBIO COMPLETADO');
    console.log('\n📝 INSTRUCCIONES:');
    console.log('1. Cierra sesión en el navegador');
    console.log('2. Vuelve a iniciar sesión con el usuario Vendedor');
    console.log('3. Ahora debería ir directo a "Salidas"');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixVendedorStartPanel();

