import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script de Migración de Permisos
 * 
 * Convierte permisos simples a permisos granulares
 * Ejemplo: ["dashboard"] → ["dashboard.alerts", "dashboard.top-customers", ...]
 * 
 * IMPORTANTE: Ejecutar ANTES de activar GRANULAR_PERMISSIONS en frontend
 */

// Mapeo de permisos antiguos → nuevos
const MIGRATION_MAP = {
  // Módulos con sub-permisos
  'dashboard': [
    'dashboard.alerts',
    'dashboard.top-customers',
    'dashboard.best-prices',
    'dashboard.expiry',
    'dashboard.idle'
  ],
  'admin': [
    'admin.dop-usd',
    'admin.usd-mn',
    'admin.shipping'
  ],
  'reports': [
    'reports.financial'
  ],
  'users': [
    'users.list',
    'users.roles'
  ],
  
  // Módulos sin sub-permisos (se mantienen igual)
  'medicines': ['medicines'],
  'customers': ['customers'],
  'suppliers': ['suppliers'],
  'receipts': ['receipts'],
  'sales': ['sales']
};

async function migratePermissions() {
  console.log('🚀 Iniciando migración de permisos...\n');
  
  try {
    // Obtener todos los roles
    const roles = await prisma.roles.findMany();
    
    console.log(`📋 Roles encontrados: ${roles.length}\n`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const role of roles) {
      console.log(`\n🔍 Procesando rol: "${role.name}" (ID: ${role.id})`);
      
      // Parsear permisos actuales
      let currentPermissions = [];
      try {
        currentPermissions = typeof role.permissions === 'string' 
          ? JSON.parse(role.permissions) 
          : role.permissions;
      } catch (e) {
        console.log(`   ⚠️  Error parseando permisos, usando array vacío`);
        currentPermissions = [];
      }
      
      console.log(`   📌 Permisos actuales: ${JSON.stringify(currentPermissions)}`);
      
      // Verificar si ya está migrado (tiene permisos con punto)
      const alreadyMigrated = currentPermissions.some(p => p.includes('.'));
      if (alreadyMigrated) {
        console.log(`   ✅ Ya migrado (tiene permisos granulares), omitiendo...`);
        skippedCount++;
        continue;
      }
      
      // Expandir permisos
      const newPermissions = [];
      for (const perm of currentPermissions) {
        if (MIGRATION_MAP[perm]) {
          newPermissions.push(...MIGRATION_MAP[perm]);
          console.log(`   🔄 "${perm}" → ${JSON.stringify(MIGRATION_MAP[perm])}`);
        } else {
          // Permiso no reconocido, mantener tal cual
          newPermissions.push(perm);
          console.log(`   ⚠️  Permiso no reconocido: "${perm}", manteniendo...`);
        }
      }
      
      console.log(`   📌 Permisos nuevos: ${JSON.stringify(newPermissions)}`);
      
      // Actualizar en base de datos
      await prisma.roles.update({
        where: { id: role.id },
        data: { 
          permissions: JSON.stringify(newPermissions),
          updated_at: new Date()
        }
      });
      
      console.log(`   ✅ Migrado exitosamente`);
      migratedCount++;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRACIÓN COMPLETADA');
    console.log('='.repeat(60));
    console.log(`📊 Resumen:`);
    console.log(`   - Roles migrados: ${migratedCount}`);
    console.log(`   - Roles omitidos (ya migrados): ${skippedCount}`);
    console.log(`   - Total procesados: ${roles.length}`);
    console.log('\n🎯 Siguiente paso:');
    console.log('   Cambiar GRANULAR_PERMISSIONS a true en frontend/src/config/featureFlags.js');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ ERROR durante la migración:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Función para revertir migración (rollback)
async function rollbackPermissions() {
  console.log('🔄 Iniciando rollback de permisos...\n');
  
  try {
    const roles = await prisma.roles.findMany();
    
    console.log(`📋 Roles encontrados: ${roles.length}\n`);
    
    // Mapeo inverso (granular → simple)
    const REVERSE_MAP = {};
    Object.entries(MIGRATION_MAP).forEach(([parent, children]) => {
      children.forEach(child => {
        REVERSE_MAP[child] = parent;
      });
    });
    
    for (const role of roles) {
      console.log(`\n🔍 Procesando rol: "${role.name}" (ID: ${role.id})`);
      
      let currentPermissions = [];
      try {
        currentPermissions = typeof role.permissions === 'string' 
          ? JSON.parse(role.permissions) 
          : role.permissions;
      } catch (e) {
        currentPermissions = [];
      }
      
      console.log(`   📌 Permisos actuales: ${JSON.stringify(currentPermissions)}`);
      
      // Contraer permisos granulares a simples
      const simplePermissions = new Set();
      for (const perm of currentPermissions) {
        if (REVERSE_MAP[perm]) {
          simplePermissions.add(REVERSE_MAP[perm]);
        } else {
          simplePermissions.add(perm);
        }
      }
      
      const newPermissions = Array.from(simplePermissions);
      console.log(`   📌 Permisos revertidos: ${JSON.stringify(newPermissions)}`);
      
      await prisma.roles.update({
        where: { id: role.id },
        data: { 
          permissions: JSON.stringify(newPermissions),
          updated_at: new Date()
        }
      });
      
      console.log(`   ✅ Revertido exitosamente`);
    }
    
    console.log('\n✅ ROLLBACK COMPLETADO\n');
    
  } catch (error) {
    console.error('\n❌ ERROR durante el rollback:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar según argumento
const command = process.argv[2];

if (command === 'rollback') {
  rollbackPermissions();
} else if (command === 'migrate' || !command) {
  migratePermissions();
} else {
  console.log('❌ Comando no reconocido');
  console.log('\nUso:');
  console.log('  node migrate-permissions-to-granular.js migrate   # Migrar a permisos granulares');
  console.log('  node migrate-permissions-to-granular.js rollback  # Revertir a permisos simples');
  process.exit(1);
}

