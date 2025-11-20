import { PrismaClient } from '@prisma/client';

let prisma;

try {
  // Prisma usa DATABASE_URL directamente de la variable de entorno
  // No necesitamos especificar datasources aquí, Prisma lo lee del schema.prisma
  prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
  
  // Verificar conexión al inicializar
  console.log('DATABASE_URL configurada:', process.env.DATABASE_URL ? 'Sí' : 'No');
} catch (error) {
  console.error('Error creating Prisma client:', error);
  // Fallback para cuando Prisma no se puede generar
  prisma = {
    medicine: {
      findMany: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
      create: () => Promise.reject(new Error('Prisma client not available')),
      update: () => Promise.reject(new Error('Prisma client not available')),
      delete: () => Promise.reject(new Error('Prisma client not available')),
    },
    medicinePrice: {
      create: () => Promise.reject(new Error('Prisma client not available')),
    },
    medicineParam: {
      upsert: () => Promise.reject(new Error('Prisma client not available')),
    },
    exchangeRate: {
      findFirst: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      create: () => Promise.reject(new Error('Prisma client not available')),
      updateMany: () => Promise.reject(new Error('Prisma client not available')),
    }
  };
}

export { prisma };