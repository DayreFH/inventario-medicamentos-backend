import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/**
 * GET /api/dashboard/metrics
 * Obtiene métricas principales del dashboard para el período especificado
 * Query params:
 *   - period: 'today' | 'week' | 'month' | 'custom'
 *   - start: fecha inicio (YYYY-MM-DD) - requerido si period='custom'
 *   - end: fecha fin (YYYY-MM-DD) - requerido si period='custom'
 */
router.get('/metrics', async (req, res) => {
  try {
    const { period = 'today', start: customStart, end: customEnd } = req.query;

    // Calcular fechas según el período
    let startDate, endDate, prevStartDate, prevEndDate;
    const now = new Date();
    
    if (period === 'custom' && customStart && customEnd) {
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
      const diffTime = endDate - startDate;
      prevEndDate = new Date(startDate);
      prevEndDate.setMilliseconds(prevEndDate.getMilliseconds() - 1);
      prevStartDate = new Date(prevEndDate);
      prevStartDate.setMilliseconds(prevStartDate.getMilliseconds() - diffTime);
    } else if (period === 'week') {
      // Esta semana (lunes a hoy)
      endDate = new Date(now);
      startDate = new Date(now);
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Ajustar al lunes
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      
      // Semana anterior
      prevEndDate = new Date(startDate);
      prevEndDate.setMilliseconds(prevEndDate.getMilliseconds() - 1);
      prevStartDate = new Date(prevEndDate);
      prevStartDate.setDate(prevStartDate.getDate() - 6);
      prevStartDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      // Este mes
      endDate = new Date(now);
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Mes anterior
      prevEndDate = new Date(startDate);
      prevEndDate.setMilliseconds(prevEndDate.getMilliseconds() - 1);
      prevStartDate = new Date(prevEndDate.getFullYear(), prevEndDate.getMonth(), 1);
    } else {
      // Hoy (por defecto)
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      
      // Ayer
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 1);
      prevEndDate = new Date(prevStartDate);
      prevEndDate.setHours(23, 59, 59, 999);
    }

    // Obtener tasa de cambio MN activa
    const exchangeRateMN = await prisma.exchangeRateMN.findFirst({
      where: { isActive: true },
      orderBy: { created_at: 'desc' }
    });
    const mnRate = exchangeRateMN ? Number(exchangeRateMN.sellRate) : 1;

    // ============================================================
    // VENTAS DEL PERÍODO ACTUAL
    // ============================================================
    const sales = await prisma.sale.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        saleitem: {
          include: {
            medicines: true
          }
        }
      }
    });

    let totalRevenueUSD = 0;
    let totalCostUSD = 0;
    let totalItemsSold = 0;
    const medicinesSold = {};
    const customerPurchases = {};

    for (const sale of sales) {
      for (const item of sale.saleitem) {
        const revenue = Number(item.precio_propuesto_usd || 0) * item.qty;
        const cost = Number(item.costo_unitario_usd || 0) * item.qty;
        
        totalRevenueUSD += revenue;
        totalCostUSD += cost;
        totalItemsSold += item.qty;

        // Acumular por medicamento
        const medKey = item.medicineId;
        if (!medicinesSold[medKey]) {
          medicinesSold[medKey] = {
            id: item.medicineId,
            code: item.medicines.codigo,
            name: item.medicines.nombreComercial,
            quantitySold: 0
          };
        }
        medicinesSold[medKey].quantitySold += item.qty;

        // Acumular por cliente
        const custKey = sale.customerId;
        if (!customerPurchases[custKey]) {
          const customer = await prisma.customer.findUnique({
            where: { id: sale.customerId }
          });
          customerPurchases[custKey] = {
            id: sale.customerId,
            name: customer?.name || 'Sin nombre',
            purchaseCount: 0
          };
        }
        customerPurchases[custKey].purchaseCount += 1;
      }
    }

    const totalProfitUSD = totalRevenueUSD - totalCostUSD;
    const profitMargin = totalRevenueUSD > 0 ? (totalProfitUSD / totalRevenueUSD) * 100 : 0;

    // ============================================================
    // VENTAS DEL PERÍODO ANTERIOR (para comparación)
    // ============================================================
    const prevSales = await prisma.sale.findMany({
      where: {
        date: {
          gte: prevStartDate,
          lte: prevEndDate
        }
      },
      include: {
        saleitem: true
      }
    });

    let prevTotalRevenueUSD = 0;
    let prevTotalCostUSD = 0;

    for (const sale of prevSales) {
      for (const item of sale.saleitem) {
        prevTotalRevenueUSD += Number(item.precio_propuesto_usd || 0) * item.qty;
        prevTotalCostUSD += Number(item.costo_unitario_usd || 0) * item.qty;
      }
    }

    const prevTotalProfitUSD = prevTotalRevenueUSD - prevTotalCostUSD;
    const prevProfitMargin = prevTotalRevenueUSD > 0 ? (prevTotalProfitUSD / prevTotalRevenueUSD) * 100 : 0;

    // Calcular porcentajes de crecimiento
    const revenueGrowth = prevTotalRevenueUSD > 0 
      ? ((totalRevenueUSD - prevTotalRevenueUSD) / prevTotalRevenueUSD) * 100 
      : 0;
    const costGrowth = prevTotalCostUSD > 0 
      ? ((totalCostUSD - prevTotalCostUSD) / prevTotalCostUSD) * 100 
      : 0;
    const profitGrowth = prevTotalProfitUSD > 0 
      ? ((totalProfitUSD - prevTotalProfitUSD) / prevTotalProfitUSD) * 100 
      : (totalProfitUSD > 0 ? 100 : 0);
    const marginGrowth = profitMargin - prevProfitMargin;

    // ============================================================
    // TOP 5 MEDICAMENTOS Y CLIENTES
    // ============================================================
    const topMedicines = Object.values(medicinesSold)
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5);

    const topCustomers = Object.values(customerPurchases)
      .sort((a, b) => b.purchaseCount - a.purchaseCount)
      .slice(0, 5);

    // ============================================================
    // ALERTAS CRÍTICAS
    // ============================================================
    const lowStockCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM medicines m
      LEFT JOIN medicine_params mp ON m.id = mp.medicineId
      WHERE m.stock <= COALESCE(mp.stockMinimo, 10)
    `;

    const expiringCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM medicines m
      LEFT JOIN medicine_params mp ON m.id = mp.medicineId
      WHERE m.fechaVencimiento IS NOT NULL
        AND DATEDIFF(m.fechaVencimiento, NOW()) <= COALESCE(mp.alertaCaducidad, 30)
        AND DATEDIFF(m.fechaVencimiento, NOW()) >= 0
    `;

    const noMovementCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM medicines m
      LEFT JOIN medicine_params mp ON m.id = mp.medicineId
      WHERE m.updated_at IS NOT NULL
        AND DATEDIFF(NOW(), m.updated_at) > COALESCE(mp.tiempoSinMovimiento, 90)
    `;

    // Margen negativo (de las ventas del período)
    let negativeMarginCount = 0;
    for (const med of Object.values(medicinesSold)) {
      const medSales = sales.flatMap(s => s.saleitem).filter(i => i.medicineId === med.id);
      let medRevenue = 0;
      let medCost = 0;
      for (const item of medSales) {
        medRevenue += Number(item.precio_propuesto_usd || 0) * item.qty;
        medCost += Number(item.costo_unitario_usd || 0) * item.qty;
      }
      if (medRevenue > 0 && medCost > medRevenue) {
        negativeMarginCount++;
      }
    }

    // ============================================================
    // TENDENCIA DE VENTAS (últimos 7 días)
    // ============================================================
    const trendDays = 7;
    const trendData = [];
    
    for (let i = trendDays - 1; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const daySales = await prisma.sale.findMany({
        where: {
          date: {
            gte: dayStart,
            lte: dayEnd
          }
        },
        include: {
          saleitem: true
        }
      });

      let dayRevenue = 0;
      for (const sale of daySales) {
        for (const item of sale.saleitem) {
          dayRevenue += Number(item.precio_propuesto_usd || 0) * item.qty;
        }
      }

      trendData.push({
        date: dayStart.toISOString().split('T')[0],
        revenueUSD: dayRevenue,
        revenueMN: dayRevenue * mnRate
      });
    }

    // ============================================================
    // RESPUESTA
    // ============================================================
    res.json({
      period: {
        type: period,
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      sales: {
        totalUSD: totalRevenueUSD,
        totalMN: totalRevenueUSD * mnRate,
        count: sales.length,
        growthPercent: revenueGrowth
      },
      costs: {
        totalUSD: totalCostUSD,
        totalMN: totalCostUSD * mnRate,
        growthPercent: costGrowth
      },
      profit: {
        totalUSD: totalProfitUSD,
        totalMN: totalProfitUSD * mnRate,
        growthPercent: profitGrowth
      },
      profitMargin: {
        current: profitMargin,
        growth: marginGrowth
      },
      itemsSold: totalItemsSold,
      topMedicines,
      topCustomers,
      alerts: {
        lowStock: Number(lowStockCount[0]?.count || 0),
        expiringSoon: Number(expiringCount[0]?.count || 0),
        negativeMargin: negativeMarginCount,
        noMovement: Number(noMovementCount[0]?.count || 0)
      },
      trend: trendData,
      exchangeRate: mnRate
    });

  } catch (error) {
    console.error('Error obteniendo métricas del dashboard:', error);
    res.status(500).json({ 
      error: 'Error obteniendo métricas del dashboard', 
      detail: error.message 
    });
  }
});

export default router;

