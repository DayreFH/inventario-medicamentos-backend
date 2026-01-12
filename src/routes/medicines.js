// backend/src/routes/medicines.js
import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/** Normaliza el precio recibido desde el frontend */
function normPrice(p) {
  if (p === undefined || p === null || p === '') return 0;
  const n = Number(p);
  return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : 0;
}

/** Calcula precio de venta basado en margen de utilidad */
// Ya no se utiliza - mantenido para compatibilidad con código legacy
function calcularPrecioVenta(precioCompra, margenUtilidad) {
  const margenDecimal = margenUtilidad / 100;
  const factor = 1 - margenDecimal;
  return factor > 0 ? precioCompra / factor : precioCompra;
}

/**
 * GET /api/medicines
 * Lista medicamentos con sus precios y parámetros (con paginación)
 * Query params: ?q=busqueda&page=1&limit=20
 */
router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  try {
    const where = q ? { 
      OR: [
        { nombreComercial: { contains: q } },
        { nombreGenerico: { contains: q } },
        { codigo: { contains: q } }
      ]
    } : undefined;

    // Consultas en paralelo: datos + conteo total
    const [data, total] = await Promise.all([
      prisma.Medicine.findMany({
        where,
        include: {
          precios: { 
            where: { activo: true },
            include: {
              supplier: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          preciosVentaMN: {
            orderBy: { created_at: 'desc' }
          },
          parametros: true
        },
        orderBy: { nombreComercial: 'asc' },
        skip: skip,
        take: limit
      }),
      prisma.Medicine.count({ where })
    ]);

    res.json({
      data: data,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo listar medicamentos', detail: e.message });
  }
});

/**
 * GET /api/medicines/:id
 * Obtiene un medicamento por id con precios y parámetros
 */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const med = await prisma.Medicine.findUnique({ 
      where: { id },
      include: {
        precios: { 
          include: {
            supplier: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: { created_at: 'desc' }
        },
        preciosVentaMN: {
          orderBy: { created_at: 'desc' }
        },
        parametros: true
      }
    });
    if (!med) return res.status(404).json({ error: 'Medicamento no encontrado' });
    res.json(med);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo obtener el medicamento', detail: e.message });
  }
});

/**
 * POST /api/medicines
 * Crea un medicamento
 */
router.post('/', async (req, res) => {
  const { 
    codigo, 
    nombreComercial, 
    nombreGenerico, 
    formaFarmaceutica, 
    concentracion, 
    presentacion, 
    fechaVencimiento, 
    pesoKg 
  } = req.body;
  
  try {
    const med = await prisma.Medicine.create({
      data: {
        codigo: String(codigo ?? '').trim(),
        nombreComercial: String(nombreComercial ?? '').trim(),
        nombreGenerico: String(nombreGenerico ?? '').trim(),
        formaFarmaceutica: formaFarmaceutica ?? 'comprimidos',
        concentracion: concentracion ?? 'mg',
        presentacion: presentacion ?? 'blister',
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
        pesoKg: normPrice(pesoKg),
      },
    });
    res.status(201).json(med);
  } catch (e) {
    if (e?.code === 'P2002') {
      return res.status(409).json({
        error: 'Duplicado',
        detail: 'Ya existe un medicamento con el mismo código.',
      });
    }
    res.status(400).json({ error: 'No se pudo crear el medicamento', detail: e.message });
  }
});

/**
 * PUT /api/medicines/:id
 * Actualiza un medicamento
 */
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { 
    codigo, 
    nombreComercial, 
    nombreGenerico, 
    formaFarmaceutica, 
    concentracion, 
    presentacion, 
    fechaVencimiento, 
    pesoKg 
  } = req.body;

  try {
    const med = await prisma.Medicine.update({
      where: { id },
      data: {
        ...(codigo !== undefined ? { codigo: String(codigo).trim() } : {}),
        ...(nombreComercial !== undefined ? { nombreComercial: String(nombreComercial).trim() } : {}),
        ...(nombreGenerico !== undefined ? { nombreGenerico: String(nombreGenerico).trim() } : {}),
        ...(formaFarmaceutica !== undefined ? { formaFarmaceutica } : {}),
        ...(concentracion !== undefined ? { concentracion } : {}),
        ...(presentacion !== undefined ? { presentacion } : {}),
        ...(fechaVencimiento !== undefined ? { fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null } : {}),
        ...(pesoKg !== undefined ? { pesoKg: normPrice(pesoKg) } : {}),
      },
    });
    res.json(med);
  } catch (e) {
    if (e?.code === 'P2002') {
      return res.status(409).json({
        error: 'Duplicado',
        detail: 'Ya existe un medicamento con el mismo código.',
      });
    }
    res.status(400).json({ error: 'No se pudo actualizar', detail: e.message });
  }
});

/**
 * POST /api/medicines/:id/precios
 * Agrega un precio a un medicamento
 */
router.post('/:id/precios', async (req, res) => {
  const id = Number(req.params.id);
  const { precioCompraUnitario, supplierId } = req.body;
  
  try {
    // Si se especifica un proveedor, desactivar solo los precios activos de ese proveedor y medicamento
    // Si no se especifica proveedor, desactivar los precios sin proveedor específico
    const whereClause = {
      medicineId: id,
      activo: true,
      ...(supplierId ? { supplierId: Number(supplierId) } : { supplierId: null })
    };
    
    await prisma.MedicinePrice.updateMany({
      where: whereClause,
      data: { activo: false }
    });
    
    const precio = await prisma.MedicinePrice.create({
      data: {
        medicineId: id,
        supplierId: supplierId ? Number(supplierId) : null,
        precioCompraUnitario: normPrice(precioCompraUnitario),
        margenUtilidad: 0,
        precioVentaUnitario: normPrice(precioCompraUnitario), // Por defecto igual al de compra
        precioLimiteDescuento: null,
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    res.status(201).json(precio);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo agregar el precio', detail: e.message });
  }
});

/**
 * PUT /api/medicines/:id/parametros
 * Actualiza parámetros de un medicamento
 */
router.put('/:id/parametros', async (req, res) => {
  const id = Number(req.params.id);
  const { stockMinimo, alertaCaducidad, tiempoSinMovimiento } = req.body;
  
  try {
    const param = await prisma.MedicineParam.upsert({
      where: { medicineId: id },
      update: {
        stockMinimo: Number(stockMinimo) || 10,
        alertaCaducidad: Number(alertaCaducidad) || 30,
        tiempoSinMovimiento: Number(tiempoSinMovimiento) || 90,
      },
      create: {
        medicineId: id,
        stockMinimo: Number(stockMinimo) || 10,
        alertaCaducidad: Number(alertaCaducidad) || 30,
        tiempoSinMovimiento: Number(tiempoSinMovimiento) || 90,
      },
    });
    res.json(param);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo actualizar los parámetros', detail: e.message });
  }
});

/**
 * DELETE /api/medicines/precios/:precioId
 * Desactiva un precio de medicamento
 */
router.delete('/precios/:precioId', async (req, res) => {
  const precioId = Number(req.params.precioId);
  try {
    await prisma.MedicinePrice.update({
      where: { id: precioId },
      data: { activo: false }
    });
    res.status(200).json({ message: 'Precio desactivado exitosamente' });
  } catch (e) {
    res.status(400).json({ error: 'No se pudo desactivar el precio', detail: e.message });
  }
});

/**
 * PUT /api/medicines/precios/:precioId/reactivar
 * Reactiva un precio de compra DOP (NO desactiva otros)
 */
router.put('/precios/:precioId/reactivar', async (req, res) => {
  const precioId = Number(req.params.precioId);
  try {
    const precio = await prisma.MedicinePrice.update({
      where: { id: precioId },
      data: { activo: true }
    });
    res.status(200).json({ message: 'Precio reactivado exitosamente', precio });
  } catch (e) {
    res.status(400).json({ error: 'No se pudo reactivar el precio', detail: e.message });
  }
});

/**
 * POST /api/medicines/:id/precios-venta-mn
 * Agrega un precio de venta MN (desactiva otros precios MN activos)
 */
router.post('/:id/precios-venta-mn', async (req, res) => {
  const id = Number(req.params.id);
  const { precioVentaMN } = req.body;
  
  try {
    // Desactivar todos los precios MN activos de este medicamento
    await prisma.MedicinePriceVentaMN.updateMany({
      where: { 
        medicineId: id,
        activo: true
      },
      data: { activo: false }
    });
    
    // Crear el nuevo precio MN activo
    const precio = await prisma.MedicinePriceVentaMN.create({
      data: {
        medicineId: id,
        precioVentaMN: normPrice(precioVentaMN),
        activo: true
      }
    });
    
    res.status(201).json(precio);
  } catch (e) {
    res.status(400).json({ error: 'No se pudo agregar el precio de venta MN', detail: e.message });
  }
});

/**
 * DELETE /api/medicines/precios-venta-mn/:precioId
 * Desactiva un precio de venta MN
 */
router.delete('/precios-venta-mn/:precioId', async (req, res) => {
  const precioId = Number(req.params.precioId);
  try {
    await prisma.MedicinePriceVentaMN.update({
      where: { id: precioId },
      data: { activo: false }
    });
    res.status(200).json({ message: 'Precio de venta MN desactivado exitosamente' });
  } catch (e) {
    res.status(400).json({ error: 'No se pudo desactivar el precio', detail: e.message });
  }
});

/**
 * PUT /api/medicines/precios-venta-mn/:precioId/reactivar
 * Reactiva un precio de venta MN (desactiva otros activos)
 */
router.put('/precios-venta-mn/:precioId/reactivar', async (req, res) => {
  const precioId = Number(req.params.precioId);
  try {
    // Obtener el precio a reactivar para saber el medicineId
    const precioToReactivate = await prisma.MedicinePriceVentaMN.findUnique({
      where: { id: precioId }
    });
    
    if (!precioToReactivate) {
      return res.status(404).json({ error: 'Precio no encontrado' });
    }
    
    // Desactivar todos los precios MN activos de este medicamento
    await prisma.MedicinePriceVentaMN.updateMany({
      where: { 
        medicineId: precioToReactivate.medicineId,
        activo: true
      },
      data: { activo: false }
    });
    
    // Reactivar el precio seleccionado
    const precio = await prisma.MedicinePriceVentaMN.update({
      where: { id: precioId },
      data: { activo: true }
    });
    
    res.status(200).json({ message: 'Precio de venta MN reactivado exitosamente', precio });
  } catch (e) {
    res.status(400).json({ error: 'No se pudo reactivar el precio', detail: e.message });
  }
});

/**
 * DELETE /api/medicines/:id
 * Elimina un medicamento
 */
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.Medicine.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    if (e?.code === 'P2003') {
      return res.status(409).json({
        error: 'No se puede eliminar el medicamento',
        detail: 'Tiene movimientos (entradas o salidas) asociados.',
      });
    }
    res.status(400).json({ error: 'No se pudo eliminar', detail: e.message });
  }
});

/**
 * GET /api/medicines/:id/prices
 * Obtener precios de un medicamento por proveedor
 */
router.get('/:id/prices', async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierId } = req.query;
    
    // Para simplificar, retornamos precios de ejemplo
    // En una implementación real, esto vendría de la base de datos
    const examplePrices = [
      {
        id: 1,
        medicineId: parseInt(id),
        precioCompraUnitario: 25.50,
        margenUtilidad: 30.0,
        precioVentaUnitario: 33.15,
        precioLimiteDescuento: 30.00,
        activo: true
      },
      {
        id: 2,
        medicineId: parseInt(id),
        precioCompraUnitario: 24.00,
        margenUtilidad: 35.0,
        precioVentaUnitario: 32.40,
        precioLimiteDescuento: 29.00,
        activo: true
      }
    ];

    res.json(examplePrices);
  } catch (error) {
    console.error('Error obteniendo precios:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      detail: error.message 
    });
  }
});

export default router;