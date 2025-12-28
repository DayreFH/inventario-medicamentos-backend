import { prisma } from '../src/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function backupDatabase() {
  try {
    console.log('🔵 Iniciando backup de base de datos con Prisma...');
    
    // Crear carpeta de backups si no existe
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Nombre del archivo con fecha y hora
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFile = path.join(backupDir, `backup_${timestamp}.json`);

    console.log('📦 Exportando datos...');

    // Exportar todas las tablas importantes
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: {
        users: await prisma.user.findMany(),
        roles: await prisma.roles.findMany(),
        medicines: await prisma.medicine.findMany({ include: { parametros: true, precios: true } }),
        customers: await prisma.customer.findMany(),
        suppliers: await prisma.supplier.findMany(),
        sales: await prisma.sale.findMany({ include: { saleitem: true } }),
        receipts: await prisma.receipt.findMany({ include: { receiptitem: true } }),
        invoices: await prisma.invoice.findMany(),
        companySettings: await prisma.companySettings.findMany(),
        exchangeRates: await prisma.exchangeRate.findMany(),
        exchangeRatesMN: await prisma.exchangeRateMN.findMany(),
        shippingRates: await prisma.shippingRate.findMany(),
        paymentMethods: await prisma.paymentMethod.findMany()
      }
    };

    // Guardar en archivo JSON
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

    const stats = fs.statSync(backupFile);
    const fileSizeInKB = (stats.size / 1024).toFixed(2);

    console.log('✅ Backup completado exitosamente!');
    console.log(`📁 Archivo: ${backupFile}`);
    console.log(`📊 Tamaño: ${fileSizeInKB} KB`);
    console.log('');
    console.log('📋 Datos exportados:');
    console.log(`   - Usuarios: ${backup.data.users.length}`);
    console.log(`   - Roles: ${backup.data.roles.length}`);
    console.log(`   - Medicamentos: ${backup.data.medicines.length}`);
    console.log(`   - Clientes: ${backup.data.customers.length}`);
    console.log(`   - Proveedores: ${backup.data.suppliers.length}`);
    console.log(`   - Ventas: ${backup.data.sales.length}`);
    console.log(`   - Entradas: ${backup.data.receipts.length}`);
    console.log(`   - Facturas: ${backup.data.invoices.length}`);
    console.log('');
    console.log('💾 Backup guardado en formato JSON');

    await prisma.$disconnect();

  } catch (error) {
    console.error('❌ Error creando backup:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

backupDatabase();


