import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/**
 * GET /api/utility-rates/current
 * Obtener el % de utilidad actual
 */
router.get('/current', async (req, res) => {
  try {
    const currentRate = await prisma.utilityRate.findFirst({
      where: { isActive: true },
      orderBy: { date: 'desc' }
    });

    if (!currentRate) {
      return res.status(404).json({
        error: 'No se encontró % de utilidad',
        message: 'No hay % de utilidad configurado'
      });
    }

    res.json({
      utilityPercentage: parseFloat(currentRate.utilityPercentage),
      source: currentRate.source,
      date: currentRate.date,
      isActive: currentRate.isActive
    });
  } catch (error) {
    console.error('Error obteniendo % de utilidad actual:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * GET /api/utility-rates/history
 * Obtener historial de % de utilidad
 */
router.get('/history', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    // Filtrar historial por días
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);
    
    const history = await prisma.utilityRate.findMany({
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
      days: parseInt(days),
      rates: history.map(rate => ({
        id: rate.id,
        utilityPercentage: parseFloat(rate.utilityPercentage),
        source: rate.source,
        date: rate.date,
        isActive: rate.isActive,
        created_at: rate.created_at
      }))
    });
  } catch (error) {
    console.error('Error obteniendo historial de % de utilidad:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * POST /api/utility-rates/update
 * Actualizar % de utilidad manualmente
 */
router.post('/update', async (req, res) => {
  try {
    const { utilityPercentage, source = 'manual' } = req.body;
    
    if (!utilityPercentage) {
      return res.status(400).json({
        error: 'Datos requeridos faltantes',
        message: 'Se requiere utilityPercentage'
      });
    }

    const parsedUtilityPercentage = parseFloat(utilityPercentage);
    
    if (isNaN(parsedUtilityPercentage) || parsedUtilityPercentage <= 0) {
      return res.status(400).json({
        error: 'Porcentaje inválido',
        message: 'El % de utilidad debe ser un número positivo'
      });
    }

    // Desactivar todas las tasas anteriores
    await prisma.utilityRate.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });

    // Crear nuevo % de utilidad
    const newRate = await prisma.utilityRate.create({
      data: {
        utilityPercentage: parsedUtilityPercentage,
        source: source,
        date: new Date(),
        isActive: true
      }
    });

    res.status(201).json({
      message: '% de utilidad actualizado exitosamente',
      rate: {
        id: newRate.id,
        utilityPercentage: parseFloat(newRate.utilityPercentage),
        source: newRate.source,
        date: newRate.date,
        isActive: newRate.isActive
      }
    });
  } catch (error) {
    console.error('Error actualizando % de utilidad:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

/**
 * DELETE /api/utility-rates/current
 * Eliminar el % de utilidad actual
 */
router.delete('/current', async (req, res) => {
  try {
    await prisma.utilityRate.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });

    res.json({
      message: '% de utilidad eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando % de utilidad actual:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

export default router;

