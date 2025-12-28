import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function backupDatabase() {
  try {
    console.log('🔵 Iniciando backup de base de datos...');
    
    // Crear carpeta de backups si no existe
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Nombre del archivo con fecha y hora
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                      new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    const backupFile = path.join(backupDir, `backup_${timestamp}.sql`);

    // Datos de conexión
    const dbHost = 'localhost';
    const dbPort = '3306';
    const dbUser = 'appuser';
    const dbPass = 'AppPass123!';
    const dbName = 'inventario_meds';

    // Comando mysqldump
    const command = `mysqldump -h ${dbHost} -P ${dbPort} -u ${dbUser} -p${dbPass} ${dbName}`;

    console.log('📦 Exportando base de datos...');
    
    const { stdout } = await execAsync(command);
    
    // Guardar en archivo
    fs.writeFileSync(backupFile, stdout);

    const stats = fs.statSync(backupFile);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log('✅ Backup completado exitosamente!');
    console.log(`📁 Archivo: ${backupFile}`);
    console.log(`📊 Tamaño: ${fileSizeInMB} MB`);
    console.log('');
    console.log('💡 Para restaurar este backup, ejecuta:');
    console.log(`   mysql -u appuser -p inventario_meds < "${backupFile}"`);

  } catch (error) {
    console.error('❌ Error creando backup:', error.message);
    process.exit(1);
  }
}

backupDatabase();


