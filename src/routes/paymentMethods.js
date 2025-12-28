import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/**
 * GET /api/payment-methods
 * Lista todos los métodos de pago activos
 */
router.get('/', async (req, res) => {
  try {
    const { includeInactive } = req.query;
    
    const methods = await prisma.paymentMethod.findMany({
      where: includeInactive === 'true' ? undefined : { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });
    
    res.json(methods);
  } catch (error) {
    console.error('Error obteniendo métodos de pago:', error);
    res.status(500).json({ 
      error: 'Error obteniendo métodos de pago', 
      detail: error.message 
    });
  }
});

/**
 * GET /api/payment-methods/:id
 * Obtiene un método de pago específico
 */
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    
    const method = await prisma.paymentMethod.findUnique({
      where: { id }
    });
    
    if (!method) {
      return res.status(404).json({ error: 'Método de pago no encontrado' });
    }
    
    res.json(method);
  } catch (error) {
    console.error('Error obteniendo método de pago:', error);
    res.status(500).json({ 
      error: 'Error obteniendo método de pago', 
      detail: error.message 
    });
  }
});

/**
 * POST /api/payment-methods
 * Crea un nuevo método de pago
 */
router.post('/', async (req, res) => {
  try {
    const { name, displayName, sortOrder } = req.body;
    
    // Validaciones
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    
    if (!displayName || displayName.trim().length === 0) {
      return res.status(400).json({ error: 'El nombre para mostrar es obligatorio' });
    }
    
    // Verificar si ya existe
    const existing = await prisma.paymentMethod.findUnique({
      where: { name: name.trim().toLowerCase() }
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un método de pago con ese nombre' });
    }
    
    const method = await prisma.paymentMethod.create({
      data: {
        name: name.trim().toLowerCase(),
        displayName: displayName.trim(),
        sortOrder: sortOrder || 0,
        isActive: true
      }
    });
    
    res.status(201).json(method);
  } catch (error) {
    console.error('Error creando método de pago:', error);
    res.status(500).json({ 
      error: 'Error creando método de pago', 
      detail: error.message 
    });
  }
});

/**
 * PUT /api/payment-methods/:id
 * Actualiza un método de pago
 */
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { displayName, isActive, sortOrder } = req.body;
    
    // Verificar que existe
    const existing = await prisma.paymentMethod.findUnique({
      where: { id }
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Método de pago no encontrado' });
    }
    
    const method = await prisma.paymentMethod.update({
      where: { id },
      data: {
        ...(displayName !== undefined && { displayName: displayName.trim() }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder })
      }
    });
    
    res.json(method);
  } catch (error) {
    console.error('Error actualizando método de pago:', error);
    res.status(500).json({ 
      error: 'Error actualizando método de pago', 
      detail: error.message 
    });
  }
});

/**
 * DELETE /api/payment-methods/:id
 * Elimina un método de pago (solo si no está en uso)
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    
    // Verificar que existe
    const existing = await prisma.paymentMethod.findUnique({
      where: { id }
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Método de pago no encontrado' });
    }
    
    // Verificar si está en uso (en ventas o facturas)
    const salesCount = await prisma.sale.count({
      where: { paymentMethod: existing.name }
    });
    
    const invoicesCount = await prisma.invoice.count({
      where: { paymentMethod: existing.name }
    });
    
    if (salesCount > 0 || invoicesCount > 0) {
      return res.status(409).json({ 
        error: 'No se puede eliminar el método de pago',
        detail: `Está siendo usado en ${salesCount} ventas y ${invoicesCount} facturas. Puede desactivarlo en su lugar.`
      });
    }
    
    await prisma.paymentMethod.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('Error eliminando método de pago:', error);
    res.status(500).json({ 
      error: 'Error eliminando método de pago', 
      detail: error.message 
    });
  }
});

export default router;

