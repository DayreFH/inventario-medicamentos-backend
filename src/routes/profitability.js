import { Router } from 'express';
import { prisma } from '../db.js';
import { z } from 'zod';

const router = Router();

// Esquema de validación para fechas
const dateRangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional()
});

/**
 * Helper: Obtener tasa de cambio activa USD -> MN
 */
async function getExchangeRate() {
  try {
    const rate = await prisma.ExchangeRateMN.findFirst({
      where: { isActive: true },
      orderBy: { date: 'desc' }
    });
    return rate ? Number(rate.sellRate) : 50; // Fallback: 50 si no hay tasa
  } catch (error) {
    console.error('Error obteniendo tasa de cambio:', error);
    return 50; // Fallback
  }
}

/**
 * GET /api/profitability/summary
 * Métricas generales de rentabilidad
 * Query params: ?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
router.get('/summary', async (req, res) => {
  try {
    const validated = dateRangeSchema.parse(req.query);
    const { start, end } = validated;

    // Construir filtro de fecha
    const dateFilter = {};
    if (start || end) {
      dateFilter.date = {};
      if (start) dateFilter.date.gte = new Date(`${start}T00:00:00`);
      if (end) dateFilter.date.lte = new Date(`${end}T23:59:59.999`);
    }

    // Obtener todos los items de venta en el período
    const saleitems = await prisma.saleitem.findMany({
      where: {
        sale: dateFilter
      },
      include: {
        sale: {
          select: {
            id: true,
            date: true
          }
        }
      }
    });

    // Calcular métricas
    let totalRevenue = 0;
    let totalCost = 0;
    const uniqueSales = new Set();
    let totalItemsSold = 0;

    for (const item of saleitems) {
      const cost = Number(item.costo_unitario_usd || 0);
      const price = Number(item.precio_propuesto_usd || 0);
      const qty = Number(item.qty || 0);

      totalCost += cost * qty;
      totalRevenue += price * qty;
      totalItemsSold += qty;
      uniqueSales.add(item.saleId);
    }

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Obtener tasa de cambio y convertir a MN
    const exchangeRate = await getExchangeRate();
    const totalRevenueMN = totalRevenue * exchangeRate;
    const totalCostMN = totalCost * exchangeRate;
    const totalProfitMN = totalProfit * exchangeRate;

    res.json({
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      profitMargin: Number(profitMargin.toFixed(2)),
      totalSales: uniqueSales.size,
      totalItemsSold,
      // Valores en MN
      totalRevenueMN: Number(totalRevenueMN.toFixed(2)),
      totalCostMN: Number(totalCostMN.toFixed(2)),
      totalProfitMN: Number(totalProfitMN.toFixed(2)),
      exchangeRate: Number(exchangeRate.toFixed(4))
    });
  } catch (error) {
    console.error('Error en /profitability/summary:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Parámetros inválidos', details: error.errors });
    }
    res.status(500).json({ error: 'Error obteniendo resumen de rentabilidad' });
  }
});

/**
 * GET /api/profitability/by-medicine
 * Rentabilidad por medicamento
 * Query params: ?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=50
 */
router.get('/by-medicine', async (req, res) => {
  try {
    const validated = dateRangeSchema.parse(req.query);
    const { start, end } = validated;
    const limit = parseInt(req.query.limit) || 50;

    // Construir filtro de fecha
    const dateFilter = {};
    if (start || end) {
      dateFilter.date = {};
      if (start) dateFilter.date.gte = new Date(`${start}T00:00:00`);
      if (end) dateFilter.date.lte = new Date(`${end}T23:59:59.999`);
    }

    // Obtener todos los items de venta con medicamentos
    const saleitems = await prisma.saleitem.findMany({
      where: {
        sale: dateFilter
      },
      include: {
        medicines: {
          select: {
            id: true,
            codigo: true,
            nombreComercial: true
          }
        },
        sale: {
          select: {
            date: true
          }
        }
      }
    });

    // Agrupar por medicamento
    const medicineMap = new Map();

    for (const item of saleitems) {
      const medId = item.medicineId;
      const cost = Number(item.costo_unitario_usd || 0);
      const price = Number(item.precio_propuesto_usd || 0);
      const qty = Number(item.qty || 0);

      if (!medicineMap.has(medId)) {
        medicineMap.set(medId, {
          medicineId: medId,
          medicineCode: item.medicines?.codigo || 'N/A',
          medicineName: item.medicines?.nombreComercial || 'Desconocido',
          quantitySold: 0,
          totalCost: 0,
          totalRevenue: 0
        });
      }

      const med = medicineMap.get(medId);
      med.quantitySold += qty;
      med.totalCost += cost * qty;
      med.totalRevenue += price * qty;
    }

    // Obtener tasa de cambio
    const exchangeRate = await getExchangeRate();

    // Calcular profit y margin para cada medicamento
    const results = Array.from(medicineMap.values()).map(med => {
      const profit = med.totalRevenue - med.totalCost;
      const profitMargin = med.totalRevenue > 0 ? (profit / med.totalRevenue) * 100 : 0;
      
      let status = 'medium';
      if (profitMargin < 0) status = 'negative';
      else if (profitMargin < 10) status = 'low';
      else if (profitMargin >= 30) status = 'high';

      // Convertir a MN
      const totalCostMN = med.totalCost * exchangeRate;
      const totalRevenueMN = med.totalRevenue * exchangeRate;
      const profitMN = profit * exchangeRate;

      return {
        medicineId: med.medicineId,
        medicineCode: med.medicineCode,
        medicineName: med.medicineName,
        quantitySold: med.quantitySold,
        totalCost: Number(med.totalCost.toFixed(2)),
        totalRevenue: Number(med.totalRevenue.toFixed(2)),
        profit: Number(profit.toFixed(2)),
        profitMargin: Number(profitMargin.toFixed(2)),
        status,
        // Valores en MN
        totalCostMN: Number(totalCostMN.toFixed(2)),
        totalRevenueMN: Number(totalRevenueMN.toFixed(2)),
        profitMN: Number(profitMN.toFixed(2))
      };
    });

    // Ordenar por ganancia (mayor a menor) y limitar
    results.sort((a, b) => b.profit - a.profit);
    const limited = results.slice(0, limit);

    res.json(limited);
  } catch (error) {
    console.error('Error en /profitability/by-medicine:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Parámetros inválidos', details: error.errors });
    }
    res.status(500).json({ error: 'Error obteniendo rentabilidad por medicamento' });
  }
});

/**
 * GET /api/profitability/by-customer
 * Rentabilidad por cliente
 * Query params: ?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=50
 */
router.get('/by-customer', async (req, res) => {
  try {
    const validated = dateRangeSchema.parse(req.query);
    const { start, end } = validated;
    const limit = parseInt(req.query.limit) || 50;

    // Construir filtro de fecha
    const dateFilter = {};
    if (start || end) {
      dateFilter.date = {};
      if (start) dateFilter.date.gte = new Date(`${start}T00:00:00`);
      if (end) dateFilter.date.lte = new Date(`${end}T23:59:59.999`);
    }

    // Obtener todas las ventas con items
    const sales = await prisma.sale.findMany({
      where: dateFilter,
      include: {
        customer: {
          select: {
            id: true,
            name: true
          }
        },
        saleitem: {
          select: {
            qty: true,
            costo_unitario_usd: true,
            precio_propuesto_usd: true
          }
        }
      }
    });

    // Agrupar por cliente
    const customerMap = new Map();

    for (const sale of sales) {
      const custId = sale.customerId;
      
      if (!customerMap.has(custId)) {
        customerMap.set(custId, {
          customerId: custId,
          customerName: sale.customer?.name || 'Desconocido',
          totalSales: 0,
          totalCost: 0,
          totalRevenue: 0
        });
      }

      const cust = customerMap.get(custId);
      cust.totalSales += 1;

      for (const item of sale.saleitem) {
        const cost = Number(item.costo_unitario_usd || 0);
        const price = Number(item.precio_propuesto_usd || 0);
        const qty = Number(item.qty || 0);

        cust.totalCost += cost * qty;
        cust.totalRevenue += price * qty;
      }
    }

    // Obtener tasa de cambio
    const exchangeRate = await getExchangeRate();

    // Calcular profit y margin para cada cliente
    const results = Array.from(customerMap.values()).map(cust => {
      const profit = cust.totalRevenue - cust.totalCost;
      const profitMargin = cust.totalRevenue > 0 ? (profit / cust.totalRevenue) * 100 : 0;

      // Convertir a MN
      const totalCostMN = cust.totalCost * exchangeRate;
      const totalRevenueMN = cust.totalRevenue * exchangeRate;
      const profitMN = profit * exchangeRate;

      return {
        customerId: cust.customerId,
        customerName: cust.customerName,
        totalSales: cust.totalSales,
        totalCost: Number(cust.totalCost.toFixed(2)),
        totalRevenue: Number(cust.totalRevenue.toFixed(2)),
        profit: Number(profit.toFixed(2)),
        profitMargin: Number(profitMargin.toFixed(2)),
        // Valores en MN
        totalCostMN: Number(totalCostMN.toFixed(2)),
        totalRevenueMN: Number(totalRevenueMN.toFixed(2)),
        profitMN: Number(profitMN.toFixed(2))
      };
    });

    // Ordenar por ganancia (mayor a menor) y limitar
    results.sort((a, b) => b.profit - a.profit);
    const limited = results.slice(0, limit);

    res.json(limited);
  } catch (error) {
    console.error('Error en /profitability/by-customer:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Parámetros inválidos', details: error.errors });
    }
    res.status(500).json({ error: 'Error obteniendo rentabilidad por cliente' });
  }
});

/**
 * GET /api/profitability/by-supplier
 * Rentabilidad por proveedor
 * Query params: ?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=50
 */
router.get('/by-supplier', async (req, res) => {
  try {
    const validated = dateRangeSchema.parse(req.query);
    const { start, end } = validated;
    const limit = parseInt(req.query.limit) || 50;

    // Construir filtro de fecha
    const dateFilter = {};
    if (start || end) {
      dateFilter.date = {};
      if (start) dateFilter.date.gte = new Date(`${start}T00:00:00`);
      if (end) dateFilter.date.lte = new Date(`${end}T23:59:59.999`);
    }

    // Obtener items de venta con supplierId
    const saleitems = await prisma.saleitem.findMany({
      where: {
        sale: dateFilter,
        supplierId: { not: null }
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true
          }
        },
        sale: {
          select: {
            date: true
          }
        }
      }
    });

    // Agrupar por proveedor
    const supplierMap = new Map();

    for (const item of saleitems) {
      const suppId = item.supplierId;
      const cost = Number(item.costo_unitario_usd || 0);
      const price = Number(item.precio_propuesto_usd || 0);
      const qty = Number(item.qty || 0);

      if (!supplierMap.has(suppId)) {
        supplierMap.set(suppId, {
          supplierId: suppId,
          supplierName: item.supplier?.name || 'Desconocido',
          totalCost: 0,
          totalRevenue: 0
        });
      }

      const supp = supplierMap.get(suppId);
      supp.totalCost += cost * qty;
      supp.totalRevenue += price * qty;
    }

    // Obtener tasa de cambio
    const exchangeRate = await getExchangeRate();

    // Calcular profit y ROI para cada proveedor
    const results = Array.from(supplierMap.values()).map(supp => {
      const profit = supp.totalRevenue - supp.totalCost;
      const roi = supp.totalCost > 0 ? (profit / supp.totalCost) * 100 : 0;

      // Convertir a MN
      const totalCostMN = supp.totalCost * exchangeRate;
      const totalRevenueMN = supp.totalRevenue * exchangeRate;
      const profitMN = profit * exchangeRate;

      return {
        supplierId: supp.supplierId,
        supplierName: supp.supplierName,
        totalCost: Number(supp.totalCost.toFixed(2)),
        totalRevenue: Number(supp.totalRevenue.toFixed(2)),
        profit: Number(profit.toFixed(2)),
        roi: Number(roi.toFixed(2)),
        // Valores en MN
        totalCostMN: Number(totalCostMN.toFixed(2)),
        totalRevenueMN: Number(totalRevenueMN.toFixed(2)),
        profitMN: Number(profitMN.toFixed(2))
      };
    });

    // Ordenar por ROI (mayor a menor) y limitar
    results.sort((a, b) => b.roi - a.roi);
    const limited = results.slice(0, limit);

    res.json(limited);
  } catch (error) {
    console.error('Error en /profitability/by-supplier:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Parámetros inválidos', details: error.errors });
    }
    res.status(500).json({ error: 'Error obteniendo rentabilidad por proveedor' });
  }
});

/**
 * GET /api/profitability/low-margin
 * Medicamentos con margen bajo o negativo
 * Query params: ?start=YYYY-MM-DD&end=YYYY-MM-DD&threshold=10
 */
router.get('/low-margin', async (req, res) => {
  try {
    const validated = dateRangeSchema.parse(req.query);
    const { start, end } = validated;
    const threshold = parseFloat(req.query.threshold) || 10;

    // Construir filtro de fecha
    const dateFilter = {};
    if (start || end) {
      dateFilter.date = {};
      if (start) dateFilter.date.gte = new Date(`${start}T00:00:00`);
      if (end) dateFilter.date.lte = new Date(`${end}T23:59:59.999`);
    }

    // Obtener todos los items de venta con medicamentos
    const saleitems = await prisma.saleitem.findMany({
      where: {
        sale: dateFilter
      },
      include: {
        medicines: {
          select: {
            id: true,
            codigo: true,
            nombreComercial: true
          }
        },
        sale: {
          select: {
            date: true
          }
        }
      }
    });

    // Agrupar por medicamento
    const medicineMap = new Map();

    for (const item of saleitems) {
      const medId = item.medicineId;
      const cost = Number(item.costo_unitario_usd || 0);
      const price = Number(item.precio_propuesto_usd || 0);
      const qty = Number(item.qty || 0);

      if (!medicineMap.has(medId)) {
        medicineMap.set(medId, {
          medicineId: medId,
          medicineCode: item.medicines?.codigo || 'N/A',
          medicineName: item.medicines?.nombreComercial || 'Desconocido',
          totalCost: 0,
          totalRevenue: 0
        });
      }

      const med = medicineMap.get(medId);
      med.totalCost += cost * qty;
      med.totalRevenue += price * qty;
    }

    // Filtrar medicamentos con margen bajo o negativo
    const alerts = [];

    for (const med of medicineMap.values()) {
      const profit = med.totalRevenue - med.totalCost;
      const profitMargin = med.totalRevenue > 0 ? (profit / med.totalRevenue) * 100 : 0;

      if (profitMargin < threshold) {
        let status = 'low';
        let alert = `Margen bajo (<${threshold}%)`;

        if (profitMargin < 0) {
          status = 'negative';
          alert = 'Pérdida - Revisar precio';
        }

        alerts.push({
          medicineId: med.medicineId,
          medicineCode: med.medicineCode,
          medicineName: med.medicineName,
          profitMargin: Number(profitMargin.toFixed(2)),
          status,
          alert
        });
      }
    }

    // Ordenar por margen (menor a mayor)
    alerts.sort((a, b) => a.profitMargin - b.profitMargin);

    res.json(alerts);
  } catch (error) {
    console.error('Error en /profitability/low-margin:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Parámetros inválidos', details: error.errors });
    }
    res.status(500).json({ error: 'Error obteniendo alertas de margen bajo' });
  }
});

export default router;

