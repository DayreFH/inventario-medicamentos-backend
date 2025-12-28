import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/**
 * GET /api/customers
 * Lista clientes, con búsqueda opcional por nombre (?q=texto)
 */
router.get('/', async (req, res) => {
  try {
    const q = req.query.q || '';
    const data = await prisma.customer.findMany({
      where: q ? { name: { contains: q } } : undefined,
      orderBy: { name: 'asc' }
    });
    res.json(data);
  } catch (error) {
    console.error('Error al cargar clientes:', error);
    res.status(500).json({ error: 'Error al cargar clientes', detail: error.message });
  }
});

/**
 * GET /api/customers/:id
 * Obtiene un cliente por id
 */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const item = await prisma.customer.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(item);
});

/**
 * POST /api/customers
 * Crea cliente { name, phone?, email? }
 */
router.post('/', async (req, res) => {
  const { name, phone, email } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  try {
    const c = await prisma.customer.create({ 
      data: { 
        name: name.trim(), 
        phone: phone?.trim() || null,
        email: email?.trim() || null
      } 
    });
    res.status(201).json(c);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo crear el cliente', detail: e.message });
  }
});

/**
 * PUT /api/customers/:id
 * Actualiza cliente { name?, phone?, email? }
 */
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, email } = req.body;
  try {
    const c = await prisma.customer.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {})
      }
    });
    res.json(c);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo actualizar el cliente', detail: e.message });
  }
});

/**
 * DELETE /api/customers/:id
 * Elimina cliente
 */
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.customer.delete({ where: { id } });
    return res.status(204).send();
  } catch (e) {
    if (e?.code === 'P2003') {
      return res.status(409).json({
        error: 'No se puede eliminar el cliente',
        detail: 'Tiene ventas asociadas.'
      });
    }
    return res.status(400).json({ error: 'No se pudo eliminar', detail: e?.message });
  }
});

export default router;