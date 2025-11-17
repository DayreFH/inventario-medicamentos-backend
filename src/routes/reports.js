import { Router } from 'express';
import { prisma } from '../db.js';
const router = Router();

router.get('/low-stock', async (req, res) => {
  try {
    // Workaround: obtener todos y filtrar por stock mínimo
    const meds = await prisma.medicine.findMany({
      include: {
        parametros: true
      }
    });
    
    // Filtrar medicamentos con stock bajo (usando parámetros o valor por defecto)
    const lows = meds
      .map(med => {
        const minStock = med.parametros?.[0]?.stockMinimo || 10; // Valor por defecto 10
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
    const totalSaleItems = await prisma.saleItem.count();
    console.log(`📊 Total de ventas: ${totalSales}`);
    console.log(`📊 Total de items de venta: ${totalSaleItems}`);
    
    if (totalSales === 0 || totalSaleItems === 0) {
      console.log('⚠️ No hay ventas registradas');
      return res.json([]);
    }
    
    // Usar Prisma de forma nativa en lugar de SQL raw para mejor compatibilidad
    const customersWithSales = await prisma.customer.findMany({
      where: {
        sales: {
          some: {
            items: {
              some: {}
            }
          }
        }
      },
      include: {
        sales: {
          include: {
            items: true
          }
        }
      }
    });
    
    console.log(`📦 Clientes con ventas encontrados: ${customersWithSales.length}`);
    
    // Calcular totales manualmente
    const customerTotals = customersWithSales.map(customer => {
      const totalQty = customer.sales.reduce((sum, sale) => {
        return sum + sale.items.reduce((itemSum, item) => itemSum + item.qty, 0);
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
    const meds = await prisma.medicine.findMany({ 
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
      min_stock: m.parametros?.[0]?.stockMinimo || 10
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
    const items = await prisma.receiptItem.findMany({
      where: { expirationDate: { not: null } },
      include: { medicine: true, receipt: true }
    });

    const map = new Map(); // medicineId -> { minExpiry, medicine }
    for (const it of items) {
      const key = it.medicineId;
      const exp = it.expirationDate ? new Date(it.expirationDate) : null;
      if (!exp) continue;
      const cur = map.get(key);
      if (!cur || exp < cur.minExpiry) {
        map.set(key, { minExpiry: exp, medicine: it.medicine });
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
    const params = await prisma.medicineParam.findMany({
      select: { medicineId: true, alertaCaducidad: true }
    });
    const medIdToThreshold = new Map(params.map(p => [p.medicineId, p.alertaCaducidad || 30]));

    const items = await prisma.receiptItem.findMany({
      where: { expirationDate: { not: null } },
      include: { medicine: true }
    });

    const map = new Map();
    for (const it of items) {
      const exp = it.expirationDate ? new Date(it.expirationDate) : null;
      if (!exp) continue;
      const cur = map.get(it.medicineId);
      if (!cur || exp < cur.minExpiry) {
        map.set(it.medicineId, { minExpiry: exp, medicine: it.medicine });
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
    const medicines = await prisma.medicine.findMany({
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
    const meds = await prisma.medicine.findMany({
      include: {
        parametros: true
      }
    });

    console.log(`📊 Total medicamentos encontrados: ${meds.length}`);

    // OPTIMIZACIÓN: Obtener TODAS las últimas ventas de una vez (1 consulta)
    const allSaleItems = await prisma.saleItem.findMany({
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
    const allReceiptItems = await prisma.receiptItem.findMany({
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
      const thresholdDays = med.parametros?.[0]?.tiempoSinMovimiento || 90;

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
    const receiptItems = await prisma.receiptItem.findMany({
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
      include: { customer: true, items: { include: { medicine: true } } },
      orderBy: { date: 'asc' }
    });
    const rows = [];
    for (const s of sales) {
      for (const it of s.items) {
        rows.push({
          id: it.id,
          date: s.date,
          customerName: s.customer?.name || '—',
          medicineId: it.medicineId,
          medicineCode: it.medicine?.codigo,
          medicineName: it.medicine?.nombreComercial,
          qty: it.qty,
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
      include: { supplier: true, items: { include: { medicine: true } } },
      orderBy: { date: 'asc' }
    });
    
    console.log(`📦 Entradas encontradas: ${receipts.length}`);
    
    const rows = [];
    for (const r of receipts) {
      for (const it of r.items) {
        const unit = typeof it.unitCost === 'object' ? parseFloat(it.unitCost.toString()) : Number(it.unitCost || 0);
        
        // Debug: mostrar info de fechas de caducidad
        if (it.expirationDate) {
          console.log(`✅ Item ${it.id} - ${it.medicine?.nombreComercial}: Fecha caducidad = ${it.expirationDate}`);
        } else {
          console.log(`❌ Item ${it.id} - ${it.medicine?.nombreComercial}: SIN fecha caducidad`);
        }
        
        rows.push({
          id: it.id,
          date: r.date,
          supplierName: r.supplier?.name || '—',
          medicineId: it.medicineId,
          medicineCode: it.medicine?.codigo,
          medicineName: it.medicine?.nombreComercial,
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
    const items = await prisma.saleItem.findMany({
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

    const items = await prisma.receiptItem.findMany({
      where: { medicineId: medId },
      include: { receipt: true, medicine: true }
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