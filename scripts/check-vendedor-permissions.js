import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkVendedorPermissions() {
  try {
    console.log('\n=== VERIFICANDO ROL VENDEDOR ===\n');
    
    // Buscar el rol Vendedor
    const vendedorRole = await prisma.role.findFirst({
      where: { name: 'Vendedor' },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!vendedorRole) {
      console.log('❌ No se encontró el rol "Vendedor"');
      return;
    }

    console.log('✅ Rol encontrado:');
    console.log('  - ID:', vendedorRole.id);
    console.log('  - Nombre:', vendedorRole.name);
    console.log('  - Descripción:', vendedorRole.description || 'Sin descripción');
    console.log('  - Panel inicial:', vendedorRole.startPanel || 'No configurado');
    
    // Parsear permisos
    let permissions = [];
    if (vendedorRole.permissions) {
      try {
        permissions = typeof vendedorRole.permissions === 'string' 
          ? JSON.parse(vendedorRole.permissions)
          : vendedorRole.permissions;
      } catch (e) {
        console.log('⚠️ Error parseando permisos:', e.message);
      }
    }
    
    console.log('  - Permisos:', permissions.length > 0 ? permissions.join(', ') : 'Ninguno');
    console.log('\n✅ Usuarios con este rol:');
    if (vendedorRole.users.length === 0) {
      console.log('  (Ninguno)');
    } else {
      vendedorRole.users.forEach(user => {
        console.log(`  - ${user.name} (${user.email})`);
      });
    }

    // Verificar si tiene permiso de dashboard
    const hasDashboardPermission = permissions.includes('dashboard');
    console.log('\n📊 Permiso "dashboard":', hasDashboardPermission ? '✅ SÍ' : '❌ NO');
    
    if (!hasDashboardPermission) {
      console.log('\n⚠️ PROBLEMA IDENTIFICADO:');
      console.log('El rol "Vendedor" NO tiene permiso "dashboard"');
      console.log('Por eso el usuario Dayre ve "Acceso Denegado"');
      console.log('\n💡 SOLUCIÓN:');
      console.log('Necesitas agregar el permiso "dashboard" al rol "Vendedor"');
      console.log('O cambiar el startPanel a un módulo al que SÍ tenga acceso (ej: "sales")');
    }

    // Mostrar todos los roles
    console.log('\n=== TODOS LOS ROLES ===\n');
    const allRoles = await prisma.role.findMany({
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    allRoles.forEach(role => {
      let perms = [];
      if (role.permissions) {
        try {
          perms = typeof role.permissions === 'string' 
            ? JSON.parse(role.permissions)
            : role.permissions;
        } catch (e) {}
      }
      console.log(`📋 ${role.name}`);
      console.log(`   Usuarios: ${role._count.users}`);
      console.log(`   Permisos: ${perms.length > 0 ? perms.join(', ') : 'Ninguno'}`);
      console.log(`   Panel inicial: ${role.startPanel || 'No configurado'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkVendedorPermissions();

