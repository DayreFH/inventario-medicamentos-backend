import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateMedicines() {
  try {
    console.log('Iniciando migración de medicamentos...');
    
    // Obtener medicamentos existentes
    const existingMedicines = await prisma.medicine.findMany();
    console.log(`Encontrados ${existingMedicines.length} medicamentos existentes`);
    
    // Crear tabla temporal para los nuevos medicamentos
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS medicines_new (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(255) UNIQUE NOT NULL,
        nombreComercial VARCHAR(255) NOT NULL,
        nombreGenerico VARCHAR(255) NOT NULL,
        formaFarmaceutica ENUM('comprimidos', 'capsulas', 'jarabe', 'suspension', 'inyectables', 'unguentos', 'gel', 'pomadas', 'soluciones', 'ovulos', 'supositorios', 'otros') DEFAULT 'comprimidos',
        concentracion ENUM('mg', 'ml', 'ui', 'estandar') DEFAULT 'mg',
        presentacion ENUM('blister', 'tubo', 'frasco', 'sobres', 'ampollas', 'otros') DEFAULT 'blister',
        fechaVencimiento DATETIME NULL,
        pesoKg DECIMAL(10,3) DEFAULT 0,
        stock INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;
    
    // Migrar datos existentes
    for (const medicine of existingMedicines) {
      await prisma.$executeRaw`
        INSERT INTO medicines_new (id, codigo, nombreComercial, nombreGenerico, formaFarmaceutica, concentracion, presentacion, stock, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        medicine.id,
        `MED-${medicine.id.toString().padStart(4, '0')}`, // Generar código único
        medicine.name,
        medicine.name, // Usar el mismo nombre para genérico
        medicine.form === 'blister' ? 'comprimidos' : 
        medicine.form === 'inyectable' ? 'inyectables' :
        medicine.form === 'frasco' ? 'frasco' :
        medicine.form === 'tubo' ? 'tubo' : 'otros',
        medicine.unit === 'mg' ? 'mg' :
        medicine.unit === 'ml' ? 'ml' :
        medicine.unit === 'g' ? 'mg' :
        medicine.unit === 'mcg' ? 'mg' :
        medicine.unit === 'l' ? 'ml' : 'estandar',
        medicine.form === 'blister' ? 'blister' :
        medicine.form === 'frasco' ? 'frasco' :
        medicine.form === 'tubo' ? 'tubo' : 'otros',
        medicine.stock,
        medicine.created_at
      ];
    }
    
    console.log('Migración completada exitosamente');
    
  } catch (error) {
    console.error('Error durante la migración:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateMedicines();

