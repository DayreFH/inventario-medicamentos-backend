import cron from 'node-cron';
import exchangeRateService from './exchangeRateService.js';

class SchedulerService {
  constructor() {
    this.tasks = new Map();
    this.isRunning = false;
  }

  /**
   * Iniciar el programador de tareas
   */
  start() {
    if (this.isRunning) {
      console.log('Scheduler ya está ejecutándose');
      return;
    }

    console.log('Iniciando scheduler de tasas de cambio...');
    this.isRunning = true;

    // Tarea para actualizar tasa de cambio a las 6:00 AM todos los días
    this.scheduleExchangeRateUpdate();
    
    // Tarea de respaldo a las 8:00 AM en caso de que falle la primera
    this.scheduleBackupUpdate();

    console.log('Scheduler iniciado correctamente');
  }

  /**
   * Programar actualización de tasa de cambio a las 6:00 AM
   */
  scheduleExchangeRateUpdate() {
    const task = cron.schedule('0 6 * * *', async () => {
      console.log('🕕 Ejecutando actualización programada de tasa de cambio (6:00 AM)...');
      await this.updateExchangeRate();
    }, {
      scheduled: true,
      timezone: 'America/Santo_Domingo' // Zona horaria de República Dominicana
    });

    this.tasks.set('exchangeRateUpdate', task);
    console.log('✅ Tarea programada: Actualización de tasa de cambio a las 6:00 AM');
  }

  /**
   * Programar actualización de respaldo a las 8:00 AM
   */
  scheduleBackupUpdate() {
    const task = cron.schedule('0 8 * * *', async () => {
      console.log('🕗 Ejecutando actualización de respaldo de tasa de cambio (8:00 AM)...');
      
      // Verificar si ya hay una tasa para hoy
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const existingRate = await exchangeRateService.getCurrentRate('USD', 'DOP');
      
      if (!existingRate || existingRate.date < today) {
        console.log('No hay tasa para hoy, ejecutando actualización de respaldo...');
        await this.updateExchangeRate();
      } else {
        console.log('Ya existe una tasa para hoy, saltando actualización de respaldo');
      }
    }, {
      scheduled: true,
      timezone: 'America/Santo_Domingo'
    });

    this.tasks.set('backupUpdate', task);
    console.log('✅ Tarea programada: Actualización de respaldo a las 8:00 AM');
  }

  /**
   * Ejecutar actualización de tasa de cambio
   */
  async updateExchangeRate() {
    try {
      console.log('🔄 Iniciando actualización de tasa de cambio...');
      
      const result = await exchangeRateService.getExchangeRate();
      
      if (result.success) {
        await exchangeRateService.saveExchangeRate(result);
        console.log('✅ Tasa de cambio actualizada exitosamente');
        
        // Log de la tasa actualizada
        const currentRate = await exchangeRateService.getCurrentRate();
        if (currentRate) {
          console.log(`📊 Tasa actual: 1 ${currentRate.fromCurrency} = ${currentRate.rate} ${currentRate.toCurrency} (${currentRate.source})`);
        }
      } else {
        console.error('❌ Error actualizando tasa de cambio:', result.error);
      }
    } catch (error) {
      console.error('❌ Error en actualización de tasa de cambio:', error);
    }
  }

  /**
   * Ejecutar actualización manual
   */
  async updateNow() {
    console.log('🔄 Ejecutando actualización manual de tasa de cambio...');
    await this.updateExchangeRate();
  }

  /**
   * Detener el programador
   */
  stop() {
    console.log('Deteniendo scheduler...');
    
    this.tasks.forEach((task, name) => {
      task.destroy();
      console.log(`✅ Tarea detenida: ${name}`);
    });
    
    this.tasks.clear();
    this.isRunning = false;
    console.log('Scheduler detenido');
  }

  /**
   * Obtener estado del scheduler
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      tasksCount: this.tasks.size,
      tasks: Array.from(this.tasks.keys())
    };
  }

  /**
   * Listar próximas ejecuciones
   */
  getNextRuns() {
    const nextRuns = [];
    
    // Calcular próxima ejecución a las 6:00 AM
    const now = new Date();
    const next6AM = new Date(now);
    next6AM.setHours(6, 0, 0, 0);
    if (next6AM <= now) {
      next6AM.setDate(next6AM.getDate() + 1);
    }
    
    // Calcular próxima ejecución a las 8:00 AM
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);
    if (next8AM <= now) {
      next8AM.setDate(next8AM.getDate() + 1);
    }
    
    nextRuns.push({
      task: 'exchangeRateUpdate',
      nextRun: next6AM,
      description: 'Actualización principal de tasa de cambio'
    });
    
    nextRuns.push({
      task: 'backupUpdate',
      nextRun: next8AM,
      description: 'Actualización de respaldo'
    });
    
    return nextRuns;
  }
}

export default new SchedulerService();








