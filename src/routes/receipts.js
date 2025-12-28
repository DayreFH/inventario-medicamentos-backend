import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/* Helpers rango de fechas */
function dayRange(dayStr) {
  const start = new Date(`${dayStr}T00:00:00`);
  const end = new Date(`${dayStr}T23:59:59.999`);
  return { start, end };
}
function weekRange(anyDateStr) {
  const d = new Date(`${anyDateStr}T00:00:00`);
  const day = d.getDay();              // 0=Dom, 1=Lun... 6=Sab
  const diffToMonday = (day + 6) % 7;  // Lunes=0
  const start = new Date(d); start.setDate(d.getDate() - diffToMonday);
  start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return { start, end };
}
function monthRange(ym) {               // ym = 'YYYY-MM'
  const [y,m] = ym.split('-').map(Number);
  const start = new Date(y, m-1, 1, 0,0,0,0);
  const end = new Date(y, m, 0, 23,59,59,999); // último día del mes
  return { start, end };
}

/**
 * Crear entrada con items y actualizar stock
 * POST /api/receipts
 * body: { supplierId, date:"YYYY-MM-DD", notes?, items:[{medicineId, qty, unit_cost}] }
 */
router.post('/', async (req, res) => {
  const { supplierId, date, notes, items } = req.body;
  try {
    // Log de entrada
    console.log('[POST /receipts] payload:', JSON.stringify({ supplierId, date, notes, items }, null, 2));

    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: { supplierId, date: new Date(`${date}T00:00:00`), notes: notes ?? null }
      });
      for (const it of items) {
        console.log(`📦 Procesando item - Medicine ID: ${it.medicineId}`);
        console.log(`   expirationDate recibido:`, it.expirationDate);
        console.log(`   Tipo:`, typeof it.expirationDate);
        
        const baseData = {
          receiptId: receipt.id,
          medicineId: it.medicineId,
          qty: it.qty,
          unit_cost: Number(it.unit_cost ?? 0),
          weight_kg: Number(it.weight_kg ?? it.weightKg ?? 0)
        };
        let dataToCreate = { ...baseData };
        if (typeof it.lot !== 'undefined') dataToCreate.lot = it.lot ?? null;
        
        if (it.expirationDate && /^\d{4}-\d{2}-\d{2}$/.test(String(it.expirationDate))) {
          dataToCreate.expirationDate = new Date(`${it.expirationDate}T00:00:00`);
          console.log(`   ✅ Fecha válida, guardando:`, dataToCreate.expirationDate);
        } else {
          console.log(`   ❌ Fecha NO válida o vacía. Valor:`, it.expirationDate);
        }
        try {
          await tx.receiptitem.create({ data: dataToCreate });
          console.log(`   ✅ Item guardado exitosamente`);
        } catch (err) {
          const msg = String(err?.message || '');
          console.warn('[POST /receipts] retry without optional fields due to:', msg);
          if (msg.includes('Unknown argument') || msg.includes('Unknown arg')) {
            // Retry sin el campo 'lot' pero manteniendo expirationDate si existe
            const retryData = { ...baseData };
            if (dataToCreate.expirationDate) {
              retryData.expirationDate = dataToCreate.expirationDate;
              console.log(`   🔄 Retry CON expirationDate:`, retryData.expirationDate);
            }
            await tx.receiptitem.create({ data: retryData });
            console.log(`   ✅ Item guardado en retry (sin campo 'lot')`);
          } else {
            throw err;
          }
        }
        await tx.Medicine.update({
          where: { id: it.medicineId },
          data: { stock: { increment: it.qty } }
        });
      }
      return receipt;
    });
    res.status(201).json({ ok: true, id: result.id });
  } catch (e) {
    console.error('[POST /receipts] error:', e);
    res.status(400).json({ error: 'No se pudo registrar la entrada', detail: e.message });
  }
});

/**
 * EDITAR entrada (reemplaza items y ajusta stock por delta)
 * PUT /api/receipts/:id
 * body: { supplierId, date, notes, items:[{medicineId, qty, unit_cost}] }
 */
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { supplierId, date, notes, items } = req.body;

  try {
    console.log('[PUT /receipts/:id] payload:', JSON.stringify({ id, supplierId, date, notes, items }, null, 2));
    await prisma.$transaction(async (tx) => {
      // Items actuales
      const prevItems = await tx.receiptitem.findMany({
        where: { receiptId: id },
        select: { medicineId: true, qty: true }
      });

      const prevMap = new Map();
      for (const it of prevItems) prevMap.set(it.medicineId, (prevMap.get(it.medicineId) || 0) + it.qty);

      const nextMap = new Map();
      for (const it of items) nextMap.set(it.medicineId, (nextMap.get(it.medicineId) || 0) + it.qty);

      // Validar que reducir no deje stock negativo
      const medsToCheck = new Set([...prevMap.keys(), ...nextMap.keys()]);
      for (const medId of medsToCheck) {
        const prev = prevMap.get(medId) || 0;
        const next = nextMap.get(medId) || 0;
        const delta = next - prev;
        if (delta < 0) {
          const med = await tx.Medicine.findUnique({ where: { id: medId } });
          if (!med) throw new Error(`Medicamento ${medId} no existe`);
          if (med.stock + delta < 0) {
            const err = new Error(`No se puede reducir la entrada de "${med.name}" tanto; dejaría stock negativo.`);
            err.code = 'STOCK_NEGATIVE';
            throw err;
          }
        }
      }

      // Ajustar stock por delta
      for (const medId of medsToCheck) {
        const prev = prevMap.get(medId) || 0;
        const next = nextMap.get(medId) || 0;
        const delta = next - prev;
        if (delta !== 0) {
          await tx.Medicine.update({
            where: { id: medId },
            data: { stock: { increment: delta } }
          });
        }
      }

      // Reemplazar items
      await tx.receiptitem.deleteMany({ where: { receiptId: id } });
      if (items.length) {
        const payload = items.map(it => ({
          receiptId: id,
          medicineId: it.medicineId,
          qty: it.qty,
          unit_cost: Number(it.unit_cost ?? 0),
          weight_kg: Number(it.weight_kg ?? it.weightKg ?? 0),
          ...(typeof it.lot !== 'undefined' ? { lot: it.lot ?? null } : {}),
          ...(it.expirationDate && /^\d{4}-\d{2}-\d{2}$/.test(String(it.expirationDate))
            ? { expirationDate: new Date(`${it.expirationDate}T00:00:00`) }
            : {})
        }));
        try {
          await tx.receiptitem.createMany({ data: payload });
        } catch (err) {
          const msg = String(err?.message || '');
          console.warn('[PUT /receipts/:id] fallback due to:', msg);
          if (msg.includes('Unknown argument') || msg.includes('Unknown arg')) {
            // Retry sin el campo 'lot' pero manteniendo expirationDate si existe
            for (const it of items) {
              const retryData = {
                receiptId: id,
                medicineId: it.medicineId,
                qty: it.qty,
                unit_cost: Number(it.unit_cost ?? 0),
                weight_kg: Number(it.weight_kg ?? it.weightKg ?? 0)
              };
              
              // Agregar expirationDate si existe y es válida
              if (it.expirationDate && /^\d{4}-\d{2}-\d{2}$/.test(String(it.expirationDate))) {
                retryData.expirationDate = new Date(`${it.expirationDate}T00:00:00`);
              }
              
              await tx.receiptitem.create({ data: retryData });
            }
          } else {
            throw err;
          }
        }
      }

      // Actualizar cabecera
      await tx.receipt.update({
        where: { id },
        data: {
          ...(supplierId ? { supplierId } : {}),
          ...(date ? { date: new Date(`${date}T00:00:00`) } : {}),
          notes: notes ?? null
        }
      });
    });

    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'STOCK_NEGATIVE') {
      return res.status(409).json({ error: 'No se puede editar la entrada', detail: e.message });
    }
    console.error('[PUT /receipts/:id] error:', e);
    res.status(400).json({ error: 'No se pudo editar la entrada', detail: e.message });
  }
});

/**
 * Listar entradas con filtros (con paginación)
 * GET /api/receipts?page=1&limit=20&day=YYYY-MM-DD&supplierId=N&q=nombreMed
 */
router.get('/', async (req, res) => {
  const { day, week, month, from, to, supplierId, q } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const where = {};
  if (supplierId) where.supplierId = Number(supplierId);

  if (day) {
    const { start, end } = dayRange(day);
    where.date = { gte: start, lte: end };
  } else if (week) {
    const { start, end } = weekRange(week);
    where.date = { gte: start, lte: end };
  } else if (month) {
    const { start, end } = monthRange(month);
    where.date = { gte: start, lte: end };
  } else if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(`${from}T00:00:00`);
    if (to) where.date.lte = new Date(`${to}T23:59:59.999`);
  }

  const whereClause = {
    ...where,
    ...(q ? { receiptitem: { some: { medicine: { nombreComercial: { contains: String(q) } } } } } : {})
  };

  try {
    // Consultas en paralelo: datos + conteo total
    const [data, total] = await Promise.all([
      prisma.receipt.findMany({
        where: whereClause,
        orderBy: { date: 'desc' },
        include: {
          supplier: true,
          receiptitem: { include: { medicine: true } }
        },
        skip: skip,
        take: limit
      }),
      prisma.receipt.count({ where: whereClause })
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
    res.status(500).json({ error: 'No se pudo listar entradas', detail: e.message });
  }
});

/**
 * Eliminar una entrada y revertir stock
 * DELETE /api/receipts/:id
 */
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      const items = await tx.receiptitem.findMany({
        where: { receiptId: id },
        select: { medicineId: true, qty: true }
      });

      // Validar que revertir no deje stock negativo
      for (const it of items) {
        const med = await tx.Medicine.findUnique({ where: { id: it.medicineId } });
        if (med.stock - it.qty < 0) {
          const err = new Error(`No se puede eliminar: dejaría stock negativo para "${med.name}"`);
          err.code = 'STOCK_NEGATIVE';
          throw err;
        }
      }

      // Revertir stock
      for (const it of items) {
        await tx.Medicine.update({
          where: { id: it.medicineId },
          data: { stock: { decrement: it.qty } }
        });
      }

      // Borrar items y cabecera
      await tx.receiptitem.deleteMany({ where: { receiptId: id } });
      await tx.receipt.delete({ where: { id } });
    });

    res.status(204).send();
  } catch (e) {
    if (e?.code === 'STOCK_NEGATIVE') {
      return res.status(409).json({ error: 'No se puede eliminar la entrada', detail: e.message });
    }
    return res.status(400).json({ error: 'No se pudo eliminar la entrada', detail: e?.message });
  }
});

export default router;