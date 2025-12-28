import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/**
 * GET /api/suppliers
 * Lista proveedores, con búsqueda opcional por nombre (?q=texto)
 */
router.get('/', async (req, res) => {
  try {
    const q = req.query.q || '';
    const data = await prisma.supplier.findMany({
      where: q ? { name: { contains: q } } : undefined,
      orderBy: { name: 'asc' }
    });
    res.json(data);
  } catch (error) {
    console.error('Error al cargar proveedores:', error);
    res.status(500).json({ error: 'Error al cargar proveedores', detail: error.message });
  }
});

/**
 * GET /api/suppliers/:id
 * Obtiene un proveedor por id
 */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const item = await prisma.supplier.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'Proveedor no encontrado' });
  res.json(item);
});

/**
 * POST /api/suppliers
 * Crea proveedor { name, phone? }
 */
router.post('/', async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  try {
    const s = await prisma.supplier.create({ data: { name: name.trim(), phone } });
    res.status(201).json(s);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo crear el proveedor', detail: e.message });
  }
});

/**
 * PUT /api/suppliers/:id
 * Actualiza proveedor { name?, phone? }
 */
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, phone } = req.body;
  try {
    const s = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(phone !== undefined ? { phone } : {})
      }
    });
    res.json(s);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo actualizar el proveedor', detail: e.message });
  }
});

/**
 * DELETE /api/suppliers/:id
 * Elimina proveedor
 */
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.supplier.delete({ where: { id } });
    return res.status(204).send();
  } catch (e) {
    if (e?.code === 'P2003') {
      return res.status(409).json({
        error: 'No se puede eliminar el proveedor',
        detail: 'Tiene entradas asociadas.'
      });
    }
    return res.status(400).json({ error: 'No se pudo eliminar', detail: e?.message });
  }
});

export default router;