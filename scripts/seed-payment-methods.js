import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPaymentMethods() {
  console.log('🔄 Iniciando seed de métodos de pago...');

  const paymentMethods = [
    { name: 'efectivo', displayName: 'Efectivo', sortOrder: 1 },
    { name: 'tarjeta', displayName: 'Tarjeta de Crédito/Débito', sortOrder: 2 },
    { name: 'transferencia', displayName: 'Transferencia Bancaria', sortOrder: 3 },
    { name: 'cheque', displayName: 'Cheque', sortOrder: 4 },
    { name: 'credito', displayName: 'Crédito', sortOrder: 5 }
  ];

  try {
    // Verificar cuántos métodos ya existen
    const existingCount = await prisma.paymentMethod.count();
    console.log(`📊 Métodos de pago existentes: ${existingCount}`);

    if (existingCount > 0) {
      console.log('✅ Ya existen métodos de pago. No se insertarán duplicados.');
      
      // Mostrar los métodos existentes
      const existing = await prisma.paymentMethod.findMany({
        orderBy: { sortOrder: 'asc' }
      });
      
      console.log('\n📋 Métodos de pago actuales:');
      existing.forEach(method => {
        console.log(`   - ${method.displayName} (${method.name}) - ${method.isActive ? '✅ Activo' : '❌ Inactivo'}`);
      });
      
      return;
    }

    // Insertar métodos de pago
    console.log('\n📝 Insertando métodos de pago...');
    
    for (const method of paymentMethods) {
      const created = await prisma.paymentMethod.create({
        data: {
          name: method.name,
          displayName: method.displayName,
          sortOrder: method.sortOrder,
          isActive: true
        }
      });
      console.log(`   ✅ ${created.displayName} creado`);
    }

    console.log('\n✅ Seed de métodos de pago completado exitosamente');

    // Mostrar resumen
    const allMethods = await prisma.paymentMethod.findMany({
      orderBy: { sortOrder: 'asc' }
    });
    
    console.log('\n📋 Métodos de pago disponibles:');
    allMethods.forEach(method => {
      console.log(`   ${method.sortOrder}. ${method.displayName} (${method.name})`);
    });

  } catch (error) {
    console.error('❌ Error en seed de métodos de pago:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedPaymentMethods();

