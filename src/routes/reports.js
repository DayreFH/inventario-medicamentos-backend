import { Router } from 'express';
import { prisma } from '../db.js';
const router = Router();

router.get('/low-stock', async (req, res) => {
  try {
    // Workaround: obtener todos y filtrar por stock mínimo
    const meds = await prisma.Medicine.findMany({
      include: {
        parametros: true
      }
    });
    
    // Filtrar medicamentos con stock bajo (usando parámetros o valor por defecto)
    const lows = meds
      .map(med => {
        const minStock = med.parametros?.stockMinimo || 10; // Valor por defecto 10
        return {
          ...med,
          min_stock: minStock,
          stockMinimo: minStock
        };
      })
      .filter(m => m.stock <= m.min_stock)
      .sort((a, b) => a.stock - b.stock);
    
    console.log(`⚠️ Medicamentos con stock bajo: ${lows.length}`);
    res.json(lows);
  } catch (error) {
    console.error('Error obteniendo stock bajo:', error);
    res.status(500).json({ 
      error: 'Error al obtener stock bajo',
      detail: error.message 
    });
  }
});

router.get('/top-customers', async (req, res) => {
  try {
    console.log('🔍 Obteniendo top clientes...');
    
    // Primero verificar si hay ventas
    const totalSales = await prisma.sale.count();
    const totalSaleItems = await prisma.saleitem.count();
    console.log(`📊 Total de ventas: ${totalSales}`);
    console.log(`📊 Total de items de venta: ${totalSaleItems}`);
    
    if (totalSales === 0 || totalSaleItems === 0) {
      console.log('⚠️ No hay ventas registradas');
      return res.json([]);
    }
    
    // Usar Prisma de forma nativa en lugar de SQL raw para mejor compatibilidad
    const customersWithSales = await prisma.customer.findMany({
      where: {
        sale: {
          some: {
            saleitem: {
              some: {}
            }
          }
        }
      },
      include: {
        sale: {
          include: {
            saleitem: true
          }
        }
      }
    });
    
    console.log(`📦 Clientes con ventas encontrados: ${customersWithSales.length}`);
    
    // Calcular totales manualmente
    const customerTotals = customersWithSales.map(customer => {
      const totalQty = customer.sale.reduce((sum, sale) => {
        return sum + sale.saleitem.reduce((itemSum, item) => itemSum + item.qty, 0);
      }, 0);
      
      return {
        id: customer.id,
        name: customer.name,
        total_qty: totalQty
      };
    }).filter(c => c.total_qty > 0)
      .sort((a, b) => b.total_qty - a.total_qty)
      .slice(0, 10);
    
    console.log(`✅ Top ${customerTotals.length} clientes procesados:`);
    customerTotals.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name}: ${c.total_qty} unidades`);
    });
    
    res.json(customerTotals);
  } catch (error) {
    console.error('❌ Error obteniendo top clientes:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al obtener top clientes',
      detail: error.message 
    });
  }
});

router.get('/stock', async (_req, res) => {
  try {
    const meds = await prisma.Medicine.findMany({ 
      orderBy: { nombreComercial: 'asc' },
      include: {
        parametros: true
      }
    });
    
    res.json(meds.map(m => ({ 
      id: m.id, 
      codigo: m.codigo,
      name: m.nombreComercial,
      genericName: m.nombreGenerico,
      form: m.formaFarmaceutica,
      unit: m.concentracion,
      presentation: m.presentacion,
      stock: m.stock, 
      min_stock: m.parametros?.stockMinimo || 10
    })));
  } catch (error) {
    console.error('Error en /reports/stock:', error);
    res.status(500).json({ error: 'Error obteniendo stock de medicamentos' });
  }
});

// Alertas de caducidad basadas en fecha de vencimiento y parámetro alertaCaducidad (días)
router.get('/expiry-alerts', async (_req, res) => {
  try {
    const today = new Date();
    // Tomar mínima fecha de vencimiento por medicamento desde ReceiptItem
    const items = await prisma.receiptitem.findMany({
      where: { expirationDate: { not: null } },
      include: { medicines: true, receipt: true }
    });

    const map = new Map(); // medicineId -> { minExpiry, medicine }
    for (const it of items) {
      const key = it.medicineId;
      const exp = it.expirationDate ? new Date(it.expirationDate) : null;
      if (!exp) continue;
      const cur = map.get(key);
      if (!cur || exp < cur.minExpiry) {
        map.set(key, { minExpiry: exp, medicine: it.medicines });
      }
    }

    const alerts = Array.from(map.entries()).map(([medicineId, { minExpiry, medicine }]) => {
      const diffMs = minExpiry.getTime() - today.getTime();
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return {
        medicineId,
        medicineCode: medicine.codigo,
        medicineName: medicine.nombreComercial,
        stock: Number(medicine.stock || 0),
        expiryDate: minExpiry,
        daysUntilExpiry: daysUntil,
        thresholdDays: undefined
      };
    }).filter(r => r.daysUntilExpiry <= 0)
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    res.json(alerts);
  } catch (error) {
    console.error('Error en /reports/expiry-alerts:', error);
    res.status(500).json({ error: 'Error obteniendo alertas de caducidad' });
  }
});

// Próximos a vencer (días restantes entre 1 y umbral)
router.get('/expiry-upcoming', async (_req, res) => {
  try {
    const today = new Date();
    const params = await prisma.MedicineParam.findMany({
      select: { medicineId: true, alertaCaducidad: true }
    });
    const medIdToThreshold = new Map(params.map(p => [p.medicineId, p.alertaCaducidad || 30]));

    const items = await prisma.receiptitem.findMany({
      where: { expirationDate: { not: null } },
      include: { medicines: true }
    });

    const map = new Map();
    for (const it of items) {
      const exp = it.expirationDate ? new Date(it.expirationDate) : null;
      if (!exp) continue;
      const cur = map.get(it.medicineId);
      if (!cur || exp < cur.minExpiry) {
        map.set(it.medicineId, { minExpiry: exp, medicine: it.medicines });
      }
    }

    const upcoming = Array.from(map.entries()).map(([medicineId, { minExpiry, medicine }]) => {
      const diffMs = minExpiry.getTime() - today.getTime();
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const threshold = medIdToThreshold.get(medicineId) ?? 30;
      return {
        medicineId,
        medicineCode: medicine.codigo,
        medicineName: medicine.nombreComercial,
        stock: Number(medicine.stock || 0),
        expiryDate: minExpiry,
        daysUntilExpiry: daysUntil,
        thresholdDays: threshold
      };
    }).filter(r => r.daysUntilExpiry > 0 && r.daysUntilExpiry <= r.thresholdDays)
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    res.json(upcoming);
  } catch (error) {
    console.error('Error en /reports/expiry-upcoming:', error);
    res.status(500).json({ error: 'Error obteniendo próximos a caducar' });
  }
});

/**
 * GET /api/reports/supplier-suggestions
 * Obtiene sugerencias de proveedores según precio más bajo por medicamento
 */
router.get('/supplier-suggestions', async (_req, res) => {
  try {
    console.log('🔍 Obteniendo sugerencias de proveedores...');
    
    // OPTIMIZACIÓN: Filtrar directamente en Prisma - SOLO precios activos
    const medicines = await prisma.Medicine.findMany({
      where: {
        precios: {
          some: { activo: true }  // Solo medicamentos con al menos 1 precio activo
        }
      },
      include: {
        precios: {
          where: { activo: true },  // ✅ Filtro directo en BD - solo precios activos
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                phone: true
              }
            }
          },
          orderBy: {
            precioCompraUnitario: 'asc'
          }
        }
      }
    });
    
    console.log(`✅ Medicamentos con precios activos: ${medicines.length}`);

    // Procesar cada medicamento para encontrar el mejor precio
    const suggestions = medicines.map(medicine => {
      if (!medicine.precios || medicine.precios.length === 0) {
        return null;
      }

      // El primer precio es el más bajo (ordenado por precioCompraUnitario asc)
      const bestPrice = medicine.precios[0];
      const allPrices = medicine.precios;
      
      // Convertir Decimal de Prisma a número
      const bestPriceValue = typeof bestPrice.precioCompraUnitario === 'object' 
        ? parseFloat(bestPrice.precioCompraUnitario.toString()) 
        : parseFloat(bestPrice.precioCompraUnitario);
      
      // Contar cuántos proveedores tienen el mismo precio (o muy cercano, con diferencia < 0.01)
      const samePriceSuppliers = allPrices.filter(p => {
        const priceValue = typeof p.precioCompraUnitario === 'object' 
          ? parseFloat(p.precioCompraUnitario.toString()) 
          : parseFloat(p.precioCompraUnitario);
        return Math.abs(priceValue - bestPriceValue) < 0.01;
      });

      const suggestion = {
        medicineId: medicine.id,
        medicineCode: medicine.codigo,
        medicineName: medicine.nombreComercial,
        stock: Number(medicine.stock),
        bestPrice: bestPriceValue,
        bestPriceId: bestPrice.id,
        supplier: bestPrice.supplier ? {
          id: bestPrice.supplier.id,
          name: bestPrice.supplier.name,
          phone: bestPrice.supplier.phone || null
        } : null,
        isGeneric: !bestPrice.supplier,
        alternativeCount: allPrices.length - 1,
        samePriceCount: samePriceSuppliers.length - 1,
        allPrices: allPrices.map(p => {
          const priceValue = typeof p.precioCompraUnitario === 'object' 
            ? parseFloat(p.precioCompraUnitario.toString()) 
            : parseFloat(p.precioCompraUnitario);
          return {
            id: p.id,
            price: priceValue,
            supplier: p.supplier ? {
              id: p.supplier.id,
              name: p.supplier.name
            } : null,
            isGeneric: !p.supplier
          };
        })
      };

      return suggestion;
    }).filter(item => item !== null); // Filtrar nulls

    // Ordenar por stock bajo primero, luego por precio
    suggestions.sort((a, b) => {
      if (a.stock !== b.stock) {
        return a.stock - b.stock; // Menor stock primero
      }
      return a.bestPrice - b.bestPrice; // Menor precio primero
    });

    console.log(`📤 Enviando ${suggestions.length} sugerencias al frontend`);
    res.json(suggestions);
  } catch (error) {
    console.error('❌ Error obteniendo sugerencias de proveedores:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al obtener sugerencias de proveedores',
      detail: error.message 
    });
  }
});

// Tiempo sin movimiento de medicamentos (OPTIMIZADO - Sin N+1)
router.get('/idle-medicines', async (_req, res) => {
  try {
    const startTime = Date.now();
    
    // OPTIMIZACIÓN: Obtener todos los medicamentos de una vez
    const meds = await prisma.Medicine.findMany({
      include: {
        parametros: true
      }
    });

    console.log(`📊 Total medicamentos encontrados: ${meds.length}`);

    // OPTIMIZACIÓN: Obtener TODAS las últimas ventas de una vez (1 consulta)
    const allSaleItems = await prisma.saleitem.findMany({
      include: {
        sale: {
          select: { date: true }
        }
      },
      orderBy: {
        sale: {
          date: 'desc'
        }
      }
    });

    // OPTIMIZACIÓN: Obtener TODAS las últimas entradas de una vez (1 consulta)
    const allReceiptItems = await prisma.receiptitem.findMany({
      include: {
        receipt: {
          select: { date: true }
        }
      },
      orderBy: {
        receipt: {
          date: 'desc'
        }
      }
    });

    // Agrupar por medicineId para obtener la última fecha de cada uno
    const lastSaleByMedicine = new Map();
    for (const item of allSaleItems) {
      if (!lastSaleByMedicine.has(item.medicineId)) {
        lastSaleByMedicine.set(item.medicineId, item.sale?.date);
      }
    }

    const lastReceiptByMedicine = new Map();
    for (const item of allReceiptItems) {
      if (!lastReceiptByMedicine.has(item.medicineId)) {
        lastReceiptByMedicine.set(item.medicineId, item.receipt?.date);
      }
    }

    const today = new Date();
    const results = [];
    const debugInfo = [];

    // Procesar cada medicamento usando los datos precargados
    for (const med of meds) {
      const lastSaleDate = lastSaleByMedicine.get(med.id);
      const lastReceiptDate = lastReceiptByMedicine.get(med.id);
      
      const lastSaleDateObj = lastSaleDate ? new Date(lastSaleDate) : null;
      const lastReceiptDateObj = lastReceiptDate ? new Date(lastReceiptDate) : null;
      
      const lastMovement = lastSaleDateObj && lastReceiptDateObj
        ? (lastSaleDateObj > lastReceiptDateObj ? lastSaleDateObj : lastReceiptDateObj)
        : (lastSaleDateObj || lastReceiptDateObj || med.created_at);

      if (!lastMovement) continue;
      
      const diffMs = today - new Date(lastMovement);
      const daysIdle = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      // Obtener el umbral de días sin movimiento configurado (por defecto 90)
      const thresholdDays = med.parametros?.tiempoSinMovimiento || 90;

      // Debug info para cada medicamento
      debugInfo.push({
        codigo: med.codigo,
        nombre: med.nombreComercial,
        daysIdle,
        thresholdDays,
        superaUmbral: daysIdle >= thresholdDays
      });

      // SOLO incluir si supera el umbral configurado
      if (daysIdle >= thresholdDays) {
        results.push({
          medicineId: med.id,
          medicineCode: med.codigo,
          medicineName: med.nombreComercial,
          stock: Number(med.stock || 0),
          lastMovementDate: lastMovement,
          daysIdle,
          thresholdDays // Incluir el umbral para referencia
        });
      }
    }

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    console.log('🔍 DEBUG - Todos los medicamentos evaluados:');
    debugInfo.forEach(info => {
      console.log(`  ${info.codigo}: ${info.daysIdle} días (umbral: ${info.thresholdDays}) - ${info.superaUmbral ? '✅ SUPERA' : '❌ NO SUPERA'}`);
    });
    console.log(`📈 Medicamentos que superan umbral: ${results.length}`);
    console.log(`⚡ Tiempo de ejecución: ${executionTime}ms (OPTIMIZADO - Sin N+1)`);

    results.sort((a, b) => b.daysIdle - a.daysIdle);
    res.json(results);
  } catch (error) {
    console.error('Error en /reports/idle-medicines:', error);
    res.status(500).json({ error: 'Error obteniendo tiempo sin movimiento' });
  }
});

// ================= REPORTES EJECUTIVOS =================

/**
 * GET /api/reports/monthly-invoicing
 * Facturación mensual agrupada por mes
 * Query params: year (opcional, default: año actual)
 */
router.get('/monthly-invoicing', async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    console.log(`📊 Obteniendo facturación mensual para año ${targetYear}`);

    // Obtener todas las facturas del año
    const startDate = new Date(targetYear, 0, 1); // 1 de enero
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999); // 31 de diciembre

    const invoices = await prisma.invoice.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        status: 'emitida' // Solo facturas emitidas
      },
      select: {
        id: true,
        ncf: true,
        subtotal: true,
        itbis: true,
        itbisAmount: true,
        discount: true,
        discountAmount: true,
        total: true,
        createdAt: true,
        sale: {
          select: {
            tipoVenta: true
          }
        }
      }
    });

    console.log(`📦 Facturas encontradas: ${invoices.length}`);

    // Agrupar por mes con separación de monedas
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      monthName: new Date(targetYear, i, 1).toLocaleString('es', { month: 'long' }),
      invoiceCount: 0,
      subtotal: 0,
      itbisAmount: 0,
      discountAmount: 0,
      total: 0,
      // Separación por moneda
      invoiceCountUSD: 0,
      subtotalUSD: 0,
      itbisAmountUSD: 0,
      discountAmountUSD: 0,
      totalUSD: 0,
      invoiceCountMN: 0,
      subtotalMN: 0,
      itbisAmountMN: 0,
      discountAmountMN: 0,
      totalMN: 0
    }));

    // Sumar valores por mes separando por moneda
    for (const invoice of invoices) {
      const month = new Date(invoice.createdAt).getMonth(); // 0-11
      const tipoVenta = invoice.sale?.tipoVenta || 'USD';
      const subtotal = Number(invoice.subtotal) || 0;
      const itbisAmount = Number(invoice.itbisAmount) || 0;
      const discountAmount = Number(invoice.discountAmount) || 0;
      const total = Number(invoice.total) || 0;

      // Totales generales (retrocompatibilidad)
      monthlyData[month].invoiceCount += 1;
      monthlyData[month].subtotal += subtotal;
      monthlyData[month].itbisAmount += itbisAmount;
      monthlyData[month].discountAmount += discountAmount;
      monthlyData[month].total += total;

      // Separar por moneda
      if (tipoVenta === 'USD') {
        monthlyData[month].invoiceCountUSD += 1;
        monthlyData[month].subtotalUSD += subtotal;
        monthlyData[month].itbisAmountUSD += itbisAmount;
        monthlyData[month].discountAmountUSD += discountAmount;
        monthlyData[month].totalUSD += total;
      } else if (tipoVenta === 'MN') {
        monthlyData[month].invoiceCountMN += 1;
        monthlyData[month].subtotalMN += subtotal;
        monthlyData[month].itbisAmountMN += itbisAmount;
        monthlyData[month].discountAmountMN += discountAmount;
        monthlyData[month].totalMN += total;
      }
    }

    // Calcular totales del año (con separación de monedas)
    const yearTotal = {
      invoiceCount: invoices.length,
      subtotal: monthlyData.reduce((sum, m) => sum + m.subtotal, 0),
      itbisAmount: monthlyData.reduce((sum, m) => sum + m.itbisAmount, 0),
      discountAmount: monthlyData.reduce((sum, m) => sum + m.discountAmount, 0),
      total: monthlyData.reduce((sum, m) => sum + m.total, 0),
      // Totales por moneda
      invoiceCountUSD: monthlyData.reduce((sum, m) => sum + m.invoiceCountUSD, 0),
      subtotalUSD: monthlyData.reduce((sum, m) => sum + m.subtotalUSD, 0),
      itbisAmountUSD: monthlyData.reduce((sum, m) => sum + m.itbisAmountUSD, 0),
      discountAmountUSD: monthlyData.reduce((sum, m) => sum + m.discountAmountUSD, 0),
      totalUSD: monthlyData.reduce((sum, m) => sum + m.totalUSD, 0),
      invoiceCountMN: monthlyData.reduce((sum, m) => sum + m.invoiceCountMN, 0),
      subtotalMN: monthlyData.reduce((sum, m) => sum + m.subtotalMN, 0),
      itbisAmountMN: monthlyData.reduce((sum, m) => sum + m.itbisAmountMN, 0),
      discountAmountMN: monthlyData.reduce((sum, m) => sum + m.discountAmountMN, 0),
      totalMN: monthlyData.reduce((sum, m) => sum + m.totalMN, 0)
    };

    // Comparación con año anterior (con separación de monedas)
    const previousYear = targetYear - 1;
    const prevStartDate = new Date(previousYear, 0, 1);
    const prevEndDate = new Date(previousYear, 11, 31, 23, 59, 59, 999);

    const previousYearInvoices = await prisma.invoice.findMany({
      where: {
        createdAt: {
          gte: prevStartDate,
          lte: prevEndDate
        },
        status: 'emitida'
      },
      select: {
        total: true,
        sale: {
          select: {
            tipoVenta: true
          }
        }
      }
    });

    let previousYearTotal = 0;
    let previousYearTotalUSD = 0;
    let previousYearTotalMN = 0;

    for (const inv of previousYearInvoices) {
      const total = Number(inv.total) || 0;
      const tipoVenta = inv.sale?.tipoVenta || 'USD';
      
      previousYearTotal += total;
      
      if (tipoVenta === 'USD') {
        previousYearTotalUSD += total;
      } else if (tipoVenta === 'MN') {
        previousYearTotalMN += total;
      }
    }

    const growthPercentage = previousYearTotal > 0 
      ? ((yearTotal.total - previousYearTotal) / previousYearTotal * 100).toFixed(2)
      : 0;

    const growthPercentageUSD = previousYearTotalUSD > 0 
      ? ((yearTotal.totalUSD - previousYearTotalUSD) / previousYearTotalUSD * 100).toFixed(2)
      : 0;

    const growthPercentageMN = previousYearTotalMN > 0 
      ? ((yearTotal.totalMN - previousYearTotalMN) / previousYearTotalMN * 100).toFixed(2)
      : 0;

    res.json({
      year: targetYear,
      monthlyData,
      yearTotal,
      comparison: {
        previousYear,
        previousYearTotal: Number(previousYearTotal.toFixed(2)),
        growthPercentage: Number(growthPercentage),
        // Comparación por moneda
        previousYearTotalUSD: Number(previousYearTotalUSD.toFixed(2)),
        previousYearTotalMN: Number(previousYearTotalMN.toFixed(2)),
        growthPercentageUSD: Number(growthPercentageUSD),
        growthPercentageMN: Number(growthPercentageMN)
      }
    });

  } catch (error) {
    console.error('Error en /reports/monthly-invoicing:', error);
    res.status(500).json({ 
      error: 'Error obteniendo facturación mensual',
      detail: error.message 
    });
  }
});

/**
 * GET /api/reports/comparative-analysis
 * Análisis comparativo entre dos períodos
 * Query params: period1Start, period1End, period2Start, period2End
 */
router.get('/comparative-analysis', async (req, res) => {
  try {
    const { period1Start, period1End, period2Start, period2End } = req.query;

    if (!period1Start || !period1End || !period2Start || !period2End) {
      return res.status(400).json({ 
        error: 'Parámetros requeridos: period1Start, period1End, period2Start, period2End' 
      });
    }

    console.log('📊 Análisis comparativo:');
    console.log(`  Período 1: ${period1Start} - ${period1End}`);
    console.log(`  Período 2: ${period2Start} - ${period2End}`);

    // Función helper para obtener datos de un período (con separación de monedas)
    const getPeriodData = async (startDate, endDate) => {
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T23:59:59.999`);

      // Facturas del período (incluir tipoVenta)
      const invoices = await prisma.invoice.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          status: 'emitida'
        },
        include: {
          sale: {
            select: {
              tipoVenta: true
            }
          }
        }
      });

      // Ventas del período
      const sales = await prisma.sale.findMany({
        where: {
          date: { gte: start, lte: end }
        },
        include: {
          saleitem: true
        }
      });

      // Compras del período
      const receipts = await prisma.receipt.findMany({
        where: {
          date: { gte: start, lte: end }
        },
        include: {
          receiptitem: true
        }
      });

      // Clientes únicos
      const uniqueCustomers = new Set(sales.map(s => s.customerId)).size;

      // Calcular totales separando por moneda
      let totalInvoiced = 0;
      let totalInvoicedUSD = 0;
      let totalInvoicedMN = 0;
      let totalITBIS = 0;
      let totalITBISUSD = 0;
      let totalITBISMN = 0;
      let totalDiscount = 0;
      let totalDiscountUSD = 0;
      let totalDiscountMN = 0;

      for (const inv of invoices) {
        const total = Number(inv.total) || 0;
        const itbis = Number(inv.itbisAmount) || 0;
        const discount = Number(inv.discountAmount) || 0;
        const tipoVenta = inv.sale?.tipoVenta || 'USD';

        totalInvoiced += total;
        totalITBIS += itbis;
        totalDiscount += discount;

        if (tipoVenta === 'USD') {
          totalInvoicedUSD += total;
          totalITBISUSD += itbis;
          totalDiscountUSD += discount;
        } else if (tipoVenta === 'MN') {
          totalInvoicedMN += total;
          totalITBISMN += itbis;
          totalDiscountMN += discount;
        }
      }

      // Separar ventas por moneda
      const salesUSD = sales.filter(s => s.tipoVenta === 'USD');
      const salesMN = sales.filter(s => s.tipoVenta === 'MN');

      const totalSalesQty = sales.reduce((sum, sale) => {
        return sum + sale.saleitem.reduce((s, item) => s + (item.qty || 0), 0);
      }, 0);

      const totalPurchasesAmount = receipts.reduce((sum, receipt) => {
        return sum + receipt.receiptitem.reduce((s, item) => {
          const cost = Number(item.unit_cost) || 0;
          const qty = item.qty || 0;
          return s + (cost * qty);
        }, 0);
      }, 0);

      return {
        invoices: {
          count: invoices.length,
          total: Number(totalInvoiced.toFixed(2)),
          itbis: Number(totalITBIS.toFixed(2)),
          discount: Number(totalDiscount.toFixed(2)),
          // Separación por moneda
          countUSD: invoices.filter(inv => inv.sale?.tipoVenta === 'USD').length,
          countMN: invoices.filter(inv => inv.sale?.tipoVenta === 'MN').length,
          totalUSD: Number(totalInvoicedUSD.toFixed(2)),
          totalMN: Number(totalInvoicedMN.toFixed(2)),
          itbisUSD: Number(totalITBISUSD.toFixed(2)),
          itbisMN: Number(totalITBISMN.toFixed(2)),
          discountUSD: Number(totalDiscountUSD.toFixed(2)),
          discountMN: Number(totalDiscountMN.toFixed(2))
        },
        sales: {
          count: sales.length,
          totalQty: totalSalesQty,
          // Separación por moneda
          countUSD: salesUSD.length,
          countMN: salesMN.length
        },
        purchases: {
          count: receipts.length,
          totalAmount: Number(totalPurchasesAmount.toFixed(2))
        },
        customers: {
          unique: uniqueCustomers
        }
      };
    };

    // Obtener datos de ambos períodos
    const [period1Data, period2Data] = await Promise.all([
      getPeriodData(period1Start, period1End),
      getPeriodData(period2Start, period2End)
    ]);

    // Calcular diferencias y porcentajes
    const calculateComparison = (value1, value2) => {
      const difference = value1 - value2;
      const percentage = value2 > 0 ? ((difference / value2) * 100).toFixed(2) : 0;
      return {
        value1,
        value2,
        difference: Number(difference.toFixed(2)),
        percentage: Number(percentage)
      };
    };

    const comparison = {
      invoices: {
        count: calculateComparison(period1Data.invoices.count, period2Data.invoices.count),
        total: calculateComparison(period1Data.invoices.total, period2Data.invoices.total),
        // Comparación por moneda
        totalUSD: calculateComparison(period1Data.invoices.totalUSD, period2Data.invoices.totalUSD),
        totalMN: calculateComparison(period1Data.invoices.totalMN, period2Data.invoices.totalMN)
      },
      sales: {
        count: calculateComparison(period1Data.sales.count, period2Data.sales.count),
        totalQty: calculateComparison(period1Data.sales.totalQty, period2Data.sales.totalQty),
        // Comparación por moneda
        countUSD: calculateComparison(period1Data.sales.countUSD, period2Data.sales.countUSD),
        countMN: calculateComparison(period1Data.sales.countMN, period2Data.sales.countMN)
      },
      purchases: {
        count: calculateComparison(period1Data.purchases.count, period2Data.purchases.count),
        totalAmount: calculateComparison(period1Data.purchases.totalAmount, period2Data.purchases.totalAmount)
      },
      customers: {
        unique: calculateComparison(period1Data.customers.unique, period2Data.customers.unique)
      }
    };

    res.json({
      period1: {
        start: period1Start,
        end: period1End,
        data: period1Data
      },
      period2: {
        start: period2Start,
        end: period2End,
        data: period2Data
      },
      comparison
    });

  } catch (error) {
    console.error('Error en /reports/comparative-analysis:', error);
    res.status(500).json({ 
      error: 'Error en análisis comparativo',
      detail: error.message 
    });
  }
});

export default router;
 
// ================= FINANZAS: Ventas y Compras por período =================
// GET /api/reports/sales-by-period?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/sales-by-period', async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = {};
    if (start || end) {
      where.date = {};
      if (start) where.date.gte = new Date(start);
      if (end) {
        const endDate = new Date(end);
        endDate.setHours(23,59,59,999);
        where.date.lte = endDate;
      }
    }
    const sales = await prisma.sale.findMany({
      where,
      include: { customer: true, items: true }
    });
    const rows = sales.map(s => ({
      id: s.id,
      date: s.date,
      customerId: s.customerId,
      customerName: s.customer?.name || '—',
      totalItems: s.items.reduce((sum, it) => sum + (it.qty || 0), 0)
      // Nota: no hay precio almacenado en SaleItem; se reporta cantidad total
    }));
    res.json(rows);
  } catch (error) {
    console.error('Error en /reports/sales-by-period:', error);
    res.status(500).json({ error: 'Error obteniendo ventas por período' });
  }
});

// GET /api/reports/purchases-by-period?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/purchases-by-period', async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = {};
    if (start || end) {
      where.date = {};
      if (start) where.date.gte = new Date(start);
      if (end) {
        const endDate = new Date(end);
        endDate.setHours(23,59,59,999);
        where.date.lte = endDate;
      }
    }
    const receipts = await prisma.receipt.findMany({
      where,
      include: { supplier: true, items: true }
    });
    const rows = receipts.map(r => {
      const totalQty = r.items.reduce((sum, it) => sum + (it.qty || 0), 0);
      const totalAmountDOP = r.items.reduce((sum, it) => {
        const unit = typeof it.unitCost === 'object' ? parseFloat(it.unitCost.toString()) : Number(it.unitCost || 0);
        return sum + (unit * (it.qty || 0));
      }, 0);
      return {
        id: r.id,
        date: r.date,
        supplierId: r.supplierId,
        supplierName: r.supplier?.name || '—',
        totalQty,
        totalAmountDOP: Number(totalAmountDOP.toFixed(2))
      };
    });
    res.json(rows);
  } catch (error) {
    console.error('Error en /reports/purchases-by-period:', error);
    res.status(500).json({ error: 'Error obteniendo compras por período' });
  }
});

// Detalle por período (nivel de ítem): fecha, contraparte y medicamento
// GET /api/reports/sales-items-by-period?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/sales-items-by-period', async (req, res) => {
  try {
    const { start, end } = req.query;
    // Normalizar fechas de filtro a límites del día para evitar desfases de zona horaria
    const startDate = start ? new Date(`${start}T00:00:00`) : undefined;
    const endDate = end ? new Date(`${end}T23:59:59.999`) : undefined;
    // Prefetch min expiration per medicine from ReceiptItem
    const receiptItems = await prisma.receiptitem.findMany({
      where: { expirationDate: { not: null } },
      select: { medicineId: true, expirationDate: true }
    });
    const minExpiryByMed = new Map();
    for (const it of receiptItems) {
      const exp = it.expirationDate ? new Date(it.expirationDate) : null;
      if (!exp) continue;
      const cur = minExpiryByMed.get(it.medicineId);
      if (!cur || exp < cur) minExpiryByMed.set(it.medicineId, exp);
    }

    const sales = await prisma.sale.findMany({
      where: (startDate || endDate) ? {
        date: {
          gte: startDate,
          lte: endDate
        }
      } : undefined,
      include: { customer: true, saleitem: { include: { medicines: true } } },
      orderBy: { date: 'asc' }
    });

    // Obtener tasa de cambio para conversiones
    const exchangeRate = await prisma.ExchangeRateMN.findFirst({
      where: { isActive: true },
      orderBy: { date: 'desc' }
    });
    const mnRate = exchangeRate ? Number(exchangeRate.sellRate) : 50;

    const rows = [];
    for (const s of sales) {
      const tipoVenta = s.tipoVenta || 'USD';
      
      for (const it of s.saleitem) {
        let priceUSD = 0, priceMN = 0;
        
        if (tipoVenta === 'USD') {
          priceUSD = Number(it.precio_propuesto_usd || 0);
          priceMN = priceUSD * mnRate;
        } else if (tipoVenta === 'MN') {
          priceMN = Number(it.precio_venta_mn || 0);
          priceUSD = priceMN / mnRate;
        }

        rows.push({
          id: it.id,
          date: s.date,
          customerName: s.customer?.name || '—',
          medicineId: it.medicineId,
          medicineCode: it.medicines?.codigo,
          medicineName: it.medicines?.nombreComercial,
          qty: it.qty,
          priceUSD: Number(priceUSD.toFixed(2)),
          priceMN: Number(priceMN.toFixed(2)),
          tipoVenta: tipoVenta,
          expirationDate: minExpiryByMed.get(it.medicineId) || null
        });
      }
    }
    res.json(rows);
  } catch (error) {
    console.error('Error en /reports/sales-items-by-period:', error);
    res.status(500).json({ error: 'Error obteniendo ventas por período (items)' });
  }
});

// GET /api/reports/purchases-items-by-period?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/purchases-items-by-period', async (req, res) => {
  console.log('🚀 [INICIO] purchases-items-by-period LLAMADO');
  console.log('📥 Query params recibidos:', req.query);
  
  try {
    const { start, end } = req.query;
    const startDate = start ? new Date(`${start}T00:00:00`) : undefined;
    const endDate = end ? new Date(`${end}T23:59:59.999`) : undefined;
    
    console.log('🔍 [purchases-items-by-period] Consultando compras...');
    console.log('   Fecha inicio:', startDate);
    console.log('   Fecha fin:', endDate);
    
    const receipts = await prisma.receipt.findMany({
      where: (startDate || endDate) ? {
        date: {
          gte: startDate,
          lte: endDate
        }
      } : undefined,
      include: { supplier: true, receiptitem: { include: { medicines: true } } },
      orderBy: { date: 'asc' }
    });
    
    console.log(`📦 Entradas encontradas: ${receipts.length}`);
    
    const rows = [];
    for (const r of receipts) {
      for (const it of r.receiptitem) {
        const unit = typeof it.unit_cost === 'object' ? parseFloat(it.unit_cost.toString()) : Number(it.unit_cost || 0);
        
        // Debug: mostrar info de fechas de caducidad
        if (it.expirationDate) {
          console.log(`✅ Item ${it.id} - ${it.medicines?.nombreComercial}: Fecha caducidad = ${it.expirationDate}`);
        } else {
          console.log(`❌ Item ${it.id} - ${it.medicines?.nombreComercial}: SIN fecha caducidad`);
        }
        
        rows.push({
          id: it.id,
          date: r.date,
          supplierName: r.supplier?.name || '—',
          medicineId: it.medicineId,
          medicineCode: it.medicines?.codigo,
          medicineName: it.medicines?.nombreComercial,
          qty: it.qty,
          unitCostDOP: Number(unit.toFixed ? unit.toFixed(2) : unit),
          expirationDate: it.expirationDate || null,
          lineTotalDOP: Number((unit * (it.qty || 0)).toFixed(2))
        });
      }
    }
    
    console.log(`📊 Total de items retornados: ${rows.length}`);
    console.log(`📅 Items CON fecha: ${rows.filter(r => r.expirationDate).length}`);
    console.log(`❌ Items SIN fecha: ${rows.filter(r => !r.expirationDate).length}`);
    
    res.json(rows);
  } catch (error) {
    console.error('Error en /reports/purchases-items-by-period:', error);
    res.status(500).json({ error: 'Error obteniendo compras por período (items)' });
  }
});
// ================= FINANZAS: Ventas / Compras por medicamento =================
// GET /api/reports/sales-by-medicine?medicineId=&start=&end=
router.get('/sales-by-medicine', async (req, res) => {
  try {
    const { medicineId, start, end } = req.query;
    const medId = Number(medicineId);
    if (!medId || Number.isNaN(medId)) {
      return res.status(400).json({ error: 'medicineId es requerido' });
    }

    // Filtrar por ítems de venta del medicamento, con join a Sale para fecha
    const items = await prisma.saleitem.findMany({
      where: { medicineId: medId },
      include: { sale: true, medicine: true }
    });

    const filtered = items.filter(it => {
      if (!it.sale?.date) return false;
      const d = new Date(it.sale.date);
      if (start && d < new Date(start)) return false;
      if (end) {
        const endDate = new Date(end);
        endDate.setHours(23,59,59,999);
        if (d > endDate) return false;
      }
      return true;
    });

    const rows = filtered.map(it => ({
      id: it.id,
      date: it.sale.date,
      qty: it.qty,
      medicineId: it.medicineId,
      medicineCode: it.medicine?.codigo || undefined,
      medicineName: it.medicine?.nombreComercial || undefined
    }));

    res.json(rows);
  } catch (error) {
    console.error('Error en /reports/sales-by-medicine:', error);
    res.status(500).json({ error: 'Error obteniendo ventas por medicamento' });
  }
});

// GET /api/reports/purchases-by-medicine?medicineId=&start=&end=
router.get('/purchases-by-medicine', async (req, res) => {
  try {
    const { medicineId, start, end } = req.query;
    const medId = Number(medicineId);
    if (!medId || Number.isNaN(medId)) {
      return res.status(400).json({ error: 'medicineId es requerido' });
    }

    const items = await prisma.receiptitem.findMany({
      where: { medicineId: medId },
      include: { receipt: true, medicines: true }
    });

    const filtered = items.filter(it => {
      if (!it.receipt?.date) return false;
      const d = new Date(it.receipt.date);
      if (start && d < new Date(start)) return false;
      if (end) {
        const endDate = new Date(end);
        endDate.setHours(23,59,59,999);
        if (d > endDate) return false;
      }
      return true;
    });

    const rows = filtered.map(it => {
      const unit = typeof it.unitCost === 'object' ? parseFloat(it.unitCost.toString()) : Number(it.unitCost || 0);
      return {
        id: it.id,
        date: it.receipt.date,
        qty: it.qty,
        unitCostDOP: Number(unit.toFixed ? unit.toFixed(2) : unit),
        lineTotalDOP: Number((unit * (it.qty || 0)).toFixed(2)),
        medicineId: it.medicineId,
        medicineCode: it.medicine?.codigo || undefined,
        medicineName: it.medicine?.nombreComercial || undefined
      };
    });

    res.json(rows);
  } catch (error) {
    console.error('Error en /reports/purchases-by-medicine:', error);
    res.status(500).json({ error: 'Error obteniendo compras por medicamento' });
  }
});

// ================= NUEVOS REPORTES DE INVENTARIO =================

/**
 * GET /api/reports/inventory-rotation
 * Análisis de rotación de inventario (productos más/menos vendidos)
 */
router.get('/inventory-rotation', async (req, res) => {
  try {
    const { start, end, limit = 20 } = req.query;
    
    // Construir filtro de fechas
    const dateFilter = {};
    if (start || end) {
      dateFilter.date = {};
      if (start) dateFilter.date.gte = new Date(start);
      if (end) {
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.date.lte = endDate;
      }
    }

    // Obtener todas las ventas del período
    const sales = await prisma.sale.findMany({
      where: dateFilter,
      include: {
        saleitem: {
          include: {
            medicines: true
          }
        }
      }
    });

    // Agrupar por medicamento
    const medicineStats = new Map();
    
    for (const sale of sales) {
      for (const item of sale.saleitem) {
        const medId = item.medicineId;
        const existing = medicineStats.get(medId);
        
        if (existing) {
          existing.totalSold += item.qty;
          if (new Date(sale.date) > new Date(existing.lastSale)) {
            existing.lastSale = sale.date;
          }
        } else {
          medicineStats.set(medId, {
            medicineId: medId,
            medicineCode: item.medicines?.codigo || 'N/A',
            medicineName: item.medicines?.nombreComercial || 'N/A',
            totalSold: item.qty,
            lastSale: sale.date,
            stock: item.medicines?.stock || 0
          });
        }
      }
    }

    // Convertir a array y ordenar
    const allMedicines = Array.from(medicineStats.values());
    
    // Top vendidos (ordenar por totalSold descendente)
    const topSelling = [...allMedicines]
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, Number(limit));

    // Menos vendidos (ordenar por totalSold ascendente, excluir los que no se vendieron)
    const lowSelling = [...allMedicines]
      .filter(m => m.totalSold > 0)
      .sort((a, b) => a.totalSold - b.totalSold)
      .slice(0, Number(limit));

    // Medicamentos sin movimiento (usar endpoint existente)
    const idleMeds = await prisma.Medicine.findMany({
      include: {
        parametros: true,
        saleitem: {
          include: {
            sale: {
              select: { date: true }
            }
          },
          orderBy: {
            sale: {
              date: 'desc'
            }
          },
          take: 1
        },
        receiptitem: {
          include: {
            receipt: {
              select: { date: true }
            }
          },
          orderBy: {
            receipt: {
              date: 'desc'
            }
          },
          take: 1
        }
      }
    });

    const today = new Date();
    const noMovement = [];

    for (const med of idleMeds) {
      const lastSaleDate = med.saleitem[0]?.sale?.date;
      const lastReceiptDate = med.receiptitem[0]?.receipt?.date;
      
      const lastMovement = lastSaleDate && lastReceiptDate
        ? (new Date(lastSaleDate) > new Date(lastReceiptDate) ? lastSaleDate : lastReceiptDate)
        : (lastSaleDate || lastReceiptDate || med.created_at);

      if (!lastMovement) continue;
      
      const diffMs = today - new Date(lastMovement);
      const daysIdle = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const thresholdDays = med.parametros?.tiempoSinMovimiento || 90;

      if (daysIdle >= thresholdDays) {
        noMovement.push({
          medicineId: med.id,
          medicineCode: med.codigo,
          medicineName: med.nombreComercial,
          stock: med.stock,
          daysIdle,
          lastMovement
        });
      }
    }

    res.json({
      topSelling,
      lowSelling,
      noMovement: noMovement.slice(0, Number(limit))
    });

  } catch (error) {
    console.error('Error en /reports/inventory-rotation:', error);
    res.status(500).json({ 
      error: 'Error obteniendo rotación de inventario',
      detail: error.message 
    });
  }
});

/**
 * GET /api/reports/inventory-valuation
 * Valorización del inventario actual (stock × precio compra)
 */
router.get('/inventory-valuation', async (req, res) => {
  try {
    // Obtener todos los medicamentos con sus precios activos
    const medicines = await prisma.Medicine.findMany({
      where: {
        stock: {
          gt: 0 // Solo medicamentos con stock
        }
      },
      include: {
        precios: {
          where: { activo: true },
          orderBy: { created_at: 'desc' },
          take: 1,
          include: {
            supplier: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    let totalValue = 0;
    const byMedicine = [];
    const supplierMap = new Map();

    for (const med of medicines) {
      const price = med.precios[0];
      if (!price) continue;

      const unitCost = Number(price.precioCompraUnitario) || 0;
      const stock = Number(med.stock) || 0;
      const totalMedValue = unitCost * stock;

      totalValue += totalMedValue;

      byMedicine.push({
        medicineId: med.id,
        medicineCode: med.codigo,
        medicineName: med.nombreComercial,
        stock: stock,
        unitCost: unitCost,
        totalValue: totalMedValue,
        supplierId: price.supplier?.id || null,
        supplierName: price.supplier?.name || 'Sin proveedor'
      });

      // Agrupar por proveedor
      const supplierId = price.supplier?.id || 0;
      const supplierName = price.supplier?.name || 'Sin proveedor';
      
      if (supplierMap.has(supplierId)) {
        const existing = supplierMap.get(supplierId);
        existing.totalValue += totalMedValue;
        existing.medicineCount += 1;
      } else {
        supplierMap.set(supplierId, {
          supplierId,
          supplierName,
          totalValue: totalMedValue,
          medicineCount: 1
        });
      }
    }

    // Convertir mapa de proveedores a array
    const bySupplier = Array.from(supplierMap.values())
      .sort((a, b) => b.totalValue - a.totalValue);

    // Ordenar medicamentos por valor total descendente
    byMedicine.sort((a, b) => b.totalValue - a.totalValue);

    res.json({
      total: Number(totalValue.toFixed(2)),
      byMedicine,
      bySupplier
    });

  } catch (error) {
    console.error('Error en /reports/inventory-valuation:', error);
    res.status(500).json({ 
      error: 'Error obteniendo valorización de inventario',
      detail: error.message 
    });
  }
});