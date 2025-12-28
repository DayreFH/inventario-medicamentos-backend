import { PrismaClient } from '@prisma/client';

// Función para conectar a una base de datos específica
async function analyzeDatabase(databaseUrl, databaseName) {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });

  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 ANÁLISIS DE: ${databaseName}`);
    console.log('='.repeat(60));

    // 1. Analizar tabla roles
    console.log('\n1️⃣ TABLA ROLES:');
    const roles = await prisma.roles.findMany({
      orderBy: { id: 'asc' }
    });

    if (roles.length === 0) {
      console.log('   ⚠️  No hay roles en esta base de datos');
    } else {
      console.log(`   Total roles: ${roles.length}\n`);
      roles.forEach(role => {
        console.log(`   📋 ID: ${role.id}`);
        console.log(`      Nombre: ${role.name}`);
        console.log(`      Descripción: ${role.description || 'N/A'}`);
        console.log(`      Panel Inicio: ${role.startPanel || 'N/A'}`);
        console.log(`      Activo: ${role.isActive ? 'Sí' : 'No'}`);
        console.log(`      Creado: ${role.created_at}`);
        console.log(`      Permisos: ${JSON.stringify(role.permissions, null, 2)}`);
        console.log('');
      });
    }

    // 2. Analizar tabla users
    console.log('\n2️⃣ TABLA USERS:');
    const users = await prisma.user.findMany({
      include: {
        roles: true
      },
      orderBy: { id: 'asc' }
    });

    if (users.length === 0) {
      console.log('   ⚠️  No hay usuarios en esta base de datos');
    } else {
      console.log(`   Total usuarios: ${users.length}\n`);
      users.forEach(user => {
        console.log(`   👤 ID: ${user.id}`);
        console.log(`      Nombre: ${user.name}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      roleId: ${user.roleId || 'NULL'}`);
        console.log(`      Rol asignado: ${user.roles ? user.roles.name : 'SIN ROL'}`);
        console.log(`      Activo: ${user.isActive ? 'Sí' : 'No'}`);
        console.log(`      Creado: ${user.created_at}`);
        console.log('');
      });
    }

    // 3. Resumen
    console.log('\n3️⃣ RESUMEN:');
    console.log(`   - Total roles: ${roles.length}`);
    console.log(`   - Total usuarios: ${users.length}`);
    console.log(`   - Usuarios sin rol: ${users.filter(u => !u.roleId).length}`);
    console.log(`   - Usuarios con rol: ${users.filter(u => u.roleId).length}`);

  } catch (error) {
    console.error(`\n❌ Error al analizar ${databaseName}:`, error.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function compareAllDatabases() {
  console.log('\n🔍 COMPARACIÓN DE BASES DE DATOS');
  console.log('='.repeat(60));

  // Base de datos LOCAL
  const localUrl = process.env.DATABASE_URL_LOCAL || 'mysql://root:@localhost:3306/inventario_meds';
  await analyzeDatabase(localUrl, 'BASE DE DATOS LOCAL');

  // Base de datos RAILWAY
  const railwayUrl = process.env.DATABASE_URL_RAILWAY || process.env.DATABASE_URL;
  await analyzeDatabase(railwayUrl, 'BASE DE DATOS RAILWAY');

  console.log('\n' + '='.repeat(60));
  console.log('✅ ANÁLISIS COMPLETADO');
  console.log('='.repeat(60));
  console.log('\n💡 CONCLUSIÓN:');
  console.log('   - Si ves diferencias, es porque son bases de datos SEPARADAS');
  console.log('   - LOCAL: Base de datos en tu computadora');
  console.log('   - RAILWAY: Base de datos en la nube (producción)');
  console.log('   - Los datos NO se sincronizan automáticamente entre ellas');
  console.log('');
}

compareAllDatabases()
  .catch(console.error);

