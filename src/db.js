import { PrismaClient } from '@prisma/client';

let prisma;

try {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || "mysql://root:password@localhost:3306/inventario_medicamentos"
      }
    },
    log: ['query', 'info', 'warn', 'error'],
  });
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