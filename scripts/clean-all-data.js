import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanAllData() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     🧹 LIMPIEZA COMPLETA DE DATOS                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. LIMPIAR ENTRADAS
    console.log('📦 PASO 1: Limpiando Entradas (Receipts)...');
    console.log('   🔄 Eliminando items de entradas...');
    const receiptItemsDeleted = await prisma.receiptitem.deleteMany({});
    console.log(`      ✅ ${receiptItemsDeleted.count} items eliminados`);

    console.log('   🔄 Eliminando entradas...');
    const receiptsDeleted = await prisma.receipt.deleteMany({});
    console.log(`      ✅ ${receiptsDeleted.count} entradas eliminadas\n`);

    // 2. RESETEAR STOCK
    console.log('📊 PASO 2: Reseteando Stock de Medicamentos...');
    console.log('   🔄 Poniendo todos los stocks en 0...');
    const stockUpdated = await prisma.medicine.updateMany({
      data: { stock: 0 }
    });
    console.log(`      ✅ ${stockUpdated.count} medicamentos actualizados\n`);

    // 3. LIMPIAR PRECIOS
    console.log('💰 PASO 3: Limpiando Precios...');
    console.log('   🔄 Eliminando precios de venta MN...');
    const ventaMNDeleted = await prisma.medicinePriceVentaMN.deleteMany({});
    console.log(`      ✅ ${ventaMNDeleted.count} precios de venta MN eliminados`);

    console.log('   🔄 Eliminando precios de compra DOP...');
    const compraDeleted = await prisma.medicinePrice.deleteMany({});
    console.log(`      ✅ ${compraDeleted.count} precios de compra eliminados\n`);

    // RESUMEN FINAL
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ ¡LIMPIEZA COMPLETADA EXITOSAMENTE!                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    console.log('📊 RESUMEN DE LIMPIEZA:');
    console.log('   ┌─────────────────────────────────────────┐');
    console.log(`   │ Items de entradas eliminados:  ${String(receiptItemsDeleted.count).padStart(8)} │`);
    console.log(`   │ Entradas eliminadas:           ${String(receiptsDeleted.count).padStart(8)} │`);
    console.log(`   │ Medicamentos con stock=0:      ${String(stockUpdated.count).padStart(8)} │`);
    console.log(`   │ Precios de venta MN eliminados:${String(ventaMNDeleted.count).padStart(8)} │`);
    console.log(`   │ Precios de compra eliminados:  ${String(compraDeleted.count).padStart(8)} │`);
    console.log('   └─────────────────────────────────────────┘\n');

    console.log('✅ LO QUE SE MANTIENE:');
    console.log('   - Medicamentos (sin stock, sin precios)');
    console.log('   - Clientes');
    console.log('   - Proveedores');
    console.log('   - Usuarios y configuración\n');

    console.log('🎯 PRÓXIMOS PASOS:');
    console.log('   1. Configura precios de compra en: Gestión de Datos → Medicamentos → Precios');
    console.log('   2. Configura precios de venta MN en: Gestión de Datos → Medicamentos → Precios');
    console.log('   3. Registra entradas de medicamentos en: Operaciones → Entradas');
    console.log('   4. Comienza a registrar ventas en: Operaciones → Salidas MN/USD\n');

  } catch (error) {
    console.error('\n❌ Error durante la limpieza:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

cleanAllData()
  .catch((e) => {
    console.error('❌ Error fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


