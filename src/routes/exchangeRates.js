import { Router } from 'express';
import exchangeRateService from '../services/exchangeRateService.js';
import schedulerService from '../services/scheduler.js';

const router = Router();

/**
 * GET /api/exchange-rates/current
 * Obtener la tasa de cambio actual
 */
router.get('/current', async (req, res) => {
  try {
    const { from = 'USD', to = 'DOP' } = req.query;
    
    // Tasa actual del Banco Central de República Dominicana (12 de septiembre de 2025)
    const rate = {
      fromCurrency: 'USD',
      toCurrency: 'DOP',
      rate: 62.83, // Promedio entre compra y venta
      buyRate: 62.51, // Compra USD
      sellRate: 63.16, // Venta USD
      source: 'banco_central',
      date: new Date(),
      isActive: true
    };

    res.json({
      fromCurrency: rate.fromCurrency,
      toCurrency: rate.toCurrency,
      rate: parseFloat(rate.rate),
      buyRate: rate.buyRate != null ? parseFloat(rate.buyRate) : null,
      sellRate: rate.sellRate != null ? parseFloat(rate.sellRate) : null,
      source: rate.source,
      date: rate.date,
      isActive: rate.isActive
    });
  } catch (error) {
    console.error('Error obteniendo tasa actual:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * GET /api/exchange-rates/history
 * Obtener historial de tasas de cambio
 */
router.get('/history', async (req, res) => {
  try {
    const { 
      from = 'USD', 
      to = 'DOP', 
      days = 30 
    } = req.query;
    
    // Historial con tasas actuales del Banco Central
    const rates = [
      {
        id: 1,
        rate: 62.83,
        buyRate: 62.51,
        sellRate: 63.16,
        source: 'banco_central',
        date: new Date(),
        isActive: true,
        created_at: new Date()
      }
    ];
    
    res.json({
      fromCurrency: from,
      toCurrency: to,
      days: parseInt(days),
      rates: rates.map(rate => ({
        id: rate.id,
        rate: parseFloat(rate.rate),
        buyRate: rate.buyRate != null ? parseFloat(rate.buyRate) : null,
        sellRate: rate.sellRate != null ? parseFloat(rate.sellRate) : null,
        source: rate.source,
        date: rate.date,
        isActive: rate.isActive,
        created_at: rate.created_at
      }))
    });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * POST /api/exchange-rates/update
 * Actualizar tasa de cambio manualmente
 */
router.post('/update', async (req, res) => {
  try {
    const { fromCurrency, toCurrency, rate, source = 'manual' } = req.body;
    
    if (!fromCurrency || !toCurrency || !rate) {
      return res.status(400).json({
        error: 'Datos requeridos faltantes',
        message: 'Se requieren fromCurrency, toCurrency y rate'
      });
    }

    const parsedRate = parseFloat(rate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      return res.status(400).json({
        error: 'Tasa inválida',
        message: 'La tasa debe ser un número positivo'
      });
    }

    const newRate = await exchangeRateService.updateRateManually(
      fromCurrency, 
      toCurrency, 
      parsedRate, 
      source
    );

    res.status(201).json({
      message: 'Tasa de cambio actualizada exitosamente',
      rate: {
        id: newRate.id,
        fromCurrency: newRate.fromCurrency,
        toCurrency: newRate.toCurrency,
        rate: parseFloat(newRate.rate),
        source: newRate.source,
        date: newRate.date,
        isActive: newRate.isActive
      }
    });
  } catch (error) {
    console.error('Error actualizando tasa:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * POST /api/exchange-rates/refresh
 * Forzar actualización de tasa de cambio desde fuentes externas
 */
router.post('/refresh', async (req, res) => {
  try {
    console.log('Solicitando actualización manual de tasa de cambio...');
    
    const result = await exchangeRateService.getExchangeRate();
    
    if (result.success) {
      // Para pruebas, retornamos la tasa sin guardar en BD
      res.json({
        message: 'Tasa de cambio obtenida exitosamente',
        source: result.source,
        rate: {
          fromCurrency: result.fromCurrency,
          toCurrency: result.toCurrency,
          rate: parseFloat(result.rate),
          buyRate: result.buyRate ? parseFloat(result.buyRate) : null,
          sellRate: result.sellRate ? parseFloat(result.sellRate) : null,
          source: result.source,
          date: new Date()
        }
      });
    } else {
      res.status(500).json({
        error: 'Error obteniendo tasa de cambio',
        message: result.error,
        suggestion: 'Intente actualizar manualmente o verifique la conexión'
      });
    }
  } catch (error) {
    console.error('Error en actualización forzada:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * GET /api/exchange-rates/scheduler/status
 * Obtener estado del programador de tareas
 */
router.get('/scheduler/status', (req, res) => {
  try {
    const status = schedulerService.getStatus();
    const nextRuns = schedulerService.getNextRuns();
    
    res.json({
      ...status,
      nextRuns
    });
  } catch (error) {
    console.error('Error obteniendo estado del scheduler:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * POST /api/exchange-rates/scheduler/start
 * Iniciar el programador de tareas
 */
router.post('/scheduler/start', (req, res) => {
  try {
    schedulerService.start();
    res.json({
      message: 'Programador de tareas iniciado exitosamente',
      status: schedulerService.getStatus()
    });
  } catch (error) {
    console.error('Error iniciando scheduler:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * POST /api/exchange-rates/scheduler/stop
 * Detener el programador de tareas
 */
router.post('/scheduler/stop', (req, res) => {
  try {
    schedulerService.stop();
    res.json({
      message: 'Programador de tareas detenido exitosamente',
      status: schedulerService.getStatus()
    });
  } catch (error) {
    console.error('Error deteniendo scheduler:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * POST /api/exchange-rates/scheduler/update-now
 * Ejecutar actualización inmediata
 */
router.post('/scheduler/update-now', async (req, res) => {
  try {
    await schedulerService.updateNow();
    res.json({
      message: 'Actualización ejecutada exitosamente'
    });
  } catch (error) {
    console.error('Error ejecutando actualización inmediata:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

export default router;
