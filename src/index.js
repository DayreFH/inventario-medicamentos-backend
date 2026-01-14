import dotenv from 'dotenv';
dotenv.config();
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Regenerar Prisma Client antes de iniciar el servidor
async function initializeServer() {
  try {
    console.log('🔄 Regenerando Prisma Client...');
    await execPromise('npx prisma generate --force');
    console.log('✅ Prisma Client regenerado exitosamente');
    
    const app = (await import('./app.js')).default;
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}`));
  } catch (error) {
    console.error('❌ Error al regenerar Prisma Client:', error);
    process.exit(1);
  }
}

initializeServer();