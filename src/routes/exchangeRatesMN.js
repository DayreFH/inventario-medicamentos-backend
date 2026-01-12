import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/**
 * GET /api/exchange-rates-mn/current
 * GET /api/exchange-rates-mn/latest (alias)
 * Obtener la tasa de cambio actual USD-MN
 */
router.get('/current', async (req, res) => {
  try {
    const currentRate = await prisma.exchangeRateMN.findFirst({
      where: { isActive: true },
      orderBy: { date: 'desc' }
    });

    if (!currentRate) {
      return res.status(404).json({
        error: 'No se encontró tasa de cambio',
        message: 'No hay tasa disponible para USD/MN'
      });
    }

    res.json({
      fromCurrency: 'USD',
      toCurrency: 'MN',
      rate: parseFloat(currentRate.sellRate), // AGREGADO: Para compatibilidad
      buyRate: parseFloat(currentRate.buyRate),
      sellRate: parseFloat(currentRate.sellRate),
      source: currentRate.source,
      date: currentRate.date,
      isActive: currentRate.isActive
    });
  } catch (error) {
    console.error('Error obteniendo tasa actual USD-MN:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

// Alias para /current
router.get('/latest', async (req, res) => {
  try {
    const currentRate = await prisma.exchangeRateMN.findFirst({
      where: { isActive: true },
      orderBy: { date: 'desc' }
    });

    if (!currentRate) {
      return res.status(404).json({
        error: 'No se encontró tasa de cambio',
        message: 'No hay tasa disponible para USD/MN'
      });
    }

    res.json({
      fromCurrency: 'USD',
      toCurrency: 'MN',
      rate: parseFloat(currentRate.sellRate), // Usar sellRate como rate principal
      buyRate: parseFloat(currentRate.buyRate),
      sellRate: parseFloat(currentRate.sellRate),
      source: currentRate.source,
      date: currentRate.date,
      isActive: currentRate.isActive
    });
  } catch (error) {
    console.error('Error obteniendo tasa actual USD-MN:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * GET /api/exchange-rates-mn/history
 * Obtener historial de tasas de cambio USD-MN
 */
router.get('/history', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    // Filtrar historial por días
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);
    
    const history = await prisma.exchangeRateMN.findMany({
      where: {
        date: {
          gte: startDate
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    
    res.json({
      fromCurrency: 'USD',
      toCurrency: 'MN',
      days: parseInt(days),
      rates: history.map(rate => ({
        id: rate.id,
        buyRate: parseFloat(rate.buyRate),
        sellRate: parseFloat(rate.sellRate),
        source: rate.source,
        date: rate.date,
        isActive: rate.isActive,
        created_at: rate.created_at
      }))
    });
  } catch (error) {
    console.error('Error obteniendo historial USD-MN:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * POST /api/exchange-rates-mn/update
 * Actualizar tasa de cambio USD-MN manualmente
 */
router.post('/update', async (req, res) => {
  try {
    const { buyRate, sellRate, source = 'manual' } = req.body;
    
    if (!buyRate || !sellRate) {
      return res.status(400).json({
        error: 'Datos requeridos faltantes',
        message: 'Se requieren buyRate y sellRate'
      });
    }

    const parsedBuyRate = parseFloat(buyRate);
    const parsedSellRate = parseFloat(sellRate);
    
    if (isNaN(parsedBuyRate) || isNaN(parsedSellRate) || 
        parsedBuyRate <= 0 || parsedSellRate <= 0) {
      return res.status(400).json({
        error: 'Tasas inválidas',
        message: 'Las tasas deben ser números positivos'
      });
    }

    if (parsedBuyRate >= parsedSellRate) {
      return res.status(400).json({
        error: 'Tasas inválidas',
        message: 'La tasa de venta debe ser mayor que la tasa de compra'
      });
    }

    // Desactivar todas las tasas anteriores
    await prisma.exchangeRateMN.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });

    // Crear nueva tasa
    const newRate = await prisma.exchangeRateMN.create({
      data: {
        buyRate: parsedBuyRate,
        sellRate: parsedSellRate,
        source: source,
        date: new Date(),
        isActive: true
      }
    });

    res.status(201).json({
      message: 'Tasa de cambio USD-MN actualizada exitosamente',
      rate: {
        id: newRate.id,
        fromCurrency: 'USD',
        toCurrency: 'MN',
        buyRate: parseFloat(newRate.buyRate),
        sellRate: parseFloat(newRate.sellRate),
        source: newRate.source,
        date: newRate.date,
        isActive: newRate.isActive
      }
    });
  } catch (error) {
    console.error('Error actualizando tasa USD-MN:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * DELETE /api/exchange-rates-mn/current
 * Eliminar la tasa actual
 */
router.delete('/current', async (req, res) => {
  try {
    await prisma.exchangeRateMN.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });

    res.json({
      message: 'Tasa actual eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando tasa actual:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

export default router;



