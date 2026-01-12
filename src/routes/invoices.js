import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/**
 * Test endpoint
 * GET /api/invoices/test
 */
router.get('/test', async (req, res) => {
  res.json({ ok: true, message: 'Invoice routes working' });
});

/**
 * Obtener ventas pendientes de facturar
 * GET /api/invoices/pending-sales
 */
router.get('/pending-sales', async (req, res) => {
  try {
    console.log('[INVOICES] Iniciando búsqueda de ventas pendientes...');
    
    // Paso 1: Obtener facturas existentes
    const invoicedSales = await prisma.invoice.findMany({
      select: { saleId: true }
    });
    console.log('[INVOICES] Facturas encontradas:', invoicedSales.length);
    
    const invoicedSaleIds = invoicedSales.map(inv => inv.saleId);
    console.log('[INVOICES] IDs de ventas facturadas:', invoicedSaleIds);

    // Paso 2: Buscar ventas sin factura (simplificado primero)
    const pendingSales = await prisma.sale.findMany({
      where: invoicedSaleIds.length > 0 ? {
        id: { notIn: invoicedSaleIds }
      } : {},
      include: {
        customer: true,
        saleitem: {
          include: {
            medicines: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    
    console.log('[INVOICES] Ventas pendientes encontradas:', pendingSales.length);

    // Paso 3: Transformar datos e incluir tipoVenta
    const transformedSales = pendingSales.map(sale => ({
      ...sale,
      tipoVenta: sale.tipoVenta || 'USD', // Por defecto USD si no está definido
      items: sale.saleitem.map(item => ({
        ...item,
        medicine: item.medicines
      }))
    }));

    console.log('[INVOICES] Datos transformados correctamente');
    res.json(transformedSales);
    
  } catch (error) {
    console.error('[INVOICES] ERROR:', error);
    console.error('[INVOICES] Stack:', error.stack);
    res.status(500).json({ 
      error: 'No se pudieron obtener las ventas pendientes', 
      detail: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Crear una factura para una venta
 * POST /api/invoices
 * body: { saleId, ncf, itbis?, discount?, notes? }
 */
router.post('/', async (req, res) => {
  const { saleId, ncf, itbis, discount, notes } = req.body;

  // Validaciones
  if (!saleId || !ncf) {
    return res.status(400).json({ 
      error: 'Datos incompletos', 
      detail: 'Se requiere saleId y ncf' 
    });
  }

  try {
    // Verificar que la venta existe y no tiene factura
    const sale = await prisma.sale.findUnique({
      where: { id: Number(saleId) },
      include: {
        invoice: true,
        saleitem: true
      }
    });

    if (!sale) {
      return res.status(404).json({ 
        error: 'Venta no encontrada', 
        detail: `No existe una venta con ID ${saleId}` 
      });
    }

    if (sale.invoice) {
      return res.status(400).json({ 
        error: 'Venta ya facturada', 
        detail: `Esta venta ya tiene la factura #${sale.invoice.id}` 
      });
    }

    // Calcular totales
    const subtotal = sale.saleitem.reduce((sum, item) => {
      const precio = Number(item.precio_propuesto_usd) || 0;
      const cantidad = Number(item.qty) || 0;
      return sum + (precio * cantidad);
    }, 0);

    const itbisAmount = subtotal * (parseFloat(itbis || 0) / 100);
    const discountAmount = subtotal * (parseFloat(discount || 0) / 100);
    const total = subtotal + itbisAmount - discountAmount;

    // Crear la factura y actualizar secuencia de NCF en una transacción
    const result = await prisma.$transaction(async (tx) => {
      // Crear la factura
      const invoice = await tx.invoice.create({
        data: {
          saleId: Number(saleId),
          ncf: ncf.trim(),
          subtotal: Number(subtotal),
          itbis: Number(parseFloat(itbis || 0)),
          itbisAmount: Number(itbisAmount),
          discount: Number(parseFloat(discount || 0)),
          discountAmount: Number(discountAmount),
          total: Number(total),
          notes: notes?.trim() || null,
          status: 'emitida'
        },
        include: {
          sale: {
            include: {
              customer: true,
              saleitem: {
                include: {
                  medicines: true
                }
              }
            }
          }
        }
      });

      // Si el NCF comienza con B01, B02, B14 o B15, incrementar la secuencia automática
      const ncfUpper = ncf.trim().toUpperCase();
      const ncfPrefix = ncfUpper.substring(0, 3); // B01, B02, etc.
      
      if (['B01', 'B02', 'B14', 'B15'].includes(ncfPrefix)) {
        // Buscar configuración de empresa
        const companySettings = await tx.companySettings.findFirst();
        
        if (companySettings && companySettings.autoGenerateNCF && companySettings.ncfPrefix === ncfPrefix) {
          // Incrementar la secuencia
          await tx.companySettings.update({
            where: { id: companySettings.id },
            data: {
              ncfSequence: companySettings.ncfSequence + 1
            }
          });
          
          console.log(`[INVOICES] NCF Sequence incrementada: ${companySettings.ncfSequence} -> ${companySettings.ncfSequence + 1}`);
        }
      }

      return invoice;
    });

    res.status(201).json({ 
      ok: true, 
      invoice: result 
    });
  } catch (error) {
    console.error('Error creando factura:', error);
    res.status(500).json({ 
      error: 'No se pudo crear la factura', 
      detail: error.message 
    });
  }
});

/**
 * Listar todas las facturas
 * GET /api/invoices
 */
router.get('/', async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        sale: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            saleitem: {
              include: {
                medicines: {
                  select: {
                    id: true,
                    nombreComercial: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(invoices);
  } catch (error) {
    console.error('Error listando facturas:', error);
    res.status(500).json({ 
      error: 'No se pudieron listar las facturas', 
      detail: error.message 
    });
  }
});

/**
 * Obtener reportes de facturación
 * GET /api/invoices/reports
 * Query params:
 *   - startDate: fecha inicio (YYYY-MM-DD)
 *   - endDate: fecha fin (YYYY-MM-DD)
 *   - customerId: filtrar por cliente (opcional)
 *   - status: 'todas' | 'emitida' | 'anulada' (opcional)
 *   - paymentMethod: filtrar por forma de pago (opcional)
 */
router.get('/reports', async (req, res) => {
  try {
    const { startDate, endDate, customerId, status, paymentMethod } = req.query;

    // Construir filtros
    const where = {};

    // Filtro de fechas
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate + 'T23:59:59.999Z')
      };
    }

    // Filtro de estado
    if (status && status !== 'todas') {
      where.status = status;
    }

    // Obtener todas las facturas con sus relaciones
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        sale: {
          include: {
            customer: true,
            saleitem: {
              include: {
                medicines: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Filtrar por cliente si se especifica
    let filteredInvoices = invoices;
    if (customerId && customerId !== 'todos') {
      filteredInvoices = invoices.filter(inv => inv.sale?.customerId === Number(customerId));
    }

    // Filtrar por forma de pago si se especifica
    if (paymentMethod && paymentMethod !== 'todas') {
      filteredInvoices = filteredInvoices.filter(inv => inv.sale?.paymentMethod === paymentMethod);
    }

    // ============================================================
    // CALCULAR MÉTRICAS
    // ============================================================
    
    let totalFacturado = 0;
    let totalAnulado = 0;
    let facturasEmitidas = 0;
    let facturasAnuladas = 0;
    let totalITBIS = 0;
    let totalDescuentos = 0;
    const ncfList = [];
    const clientesMap = {};
    const porFormaPago = {
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      credito: 0
    };
    const facturasPorDia = {};

    for (const invoice of filteredInvoices) {
      const total = Number(invoice.total) || 0;
      const itbisAmount = Number(invoice.itbisAmount) || 0;
      const discountAmount = Number(invoice.discountAmount) || 0;
      const isEmitida = invoice.status === 'emitida';

      // Totales
      if (isEmitida) {
        totalFacturado += total;
        facturasEmitidas++;
      } else {
        totalAnulado += total;
        facturasAnuladas++;
      }

      // ITBIS y Descuentos (solo emitidas)
      if (isEmitida) {
        totalITBIS += itbisAmount;
        totalDescuentos += discountAmount;
      }

      // NCF
      if (invoice.ncf) {
        ncfList.push(invoice.ncf);
      }

      // Por cliente
      if (invoice.sale?.customer && isEmitida) {
        const custId = invoice.sale.customerId;
        if (!clientesMap[custId]) {
          clientesMap[custId] = {
            id: custId,
            name: invoice.sale.customer.name,
            rnc: invoice.sale.customer.rnc || 'N/A',
            totalFacturado: 0,
            cantidadFacturas: 0
          };
        }
        clientesMap[custId].totalFacturado += total;
        clientesMap[custId].cantidadFacturas++;
      }

      // Por forma de pago (solo emitidas)
      if (isEmitida && invoice.sale?.paymentMethod) {
        const method = invoice.sale.paymentMethod.toLowerCase();
        if (porFormaPago.hasOwnProperty(method)) {
          porFormaPago[method] += total;
        }
      }

      // Por día
      const fecha = new Date(invoice.createdAt).toISOString().split('T')[0];
      if (!facturasPorDia[fecha]) {
        facturasPorDia[fecha] = {
          fecha,
          cantidad: 0,
          monto: 0
        };
      }
      if (isEmitida) {
        facturasPorDia[fecha].cantidad++;
        facturasPorDia[fecha].monto += total;
      }
    }

    // Calcular promedios
    const promedioFactura = facturasEmitidas > 0 ? totalFacturado / facturasEmitidas : 0;
    const promedioITBIS = facturasEmitidas > 0 ? totalITBIS / facturasEmitidas : 0;
    const promedioDescuento = facturasEmitidas > 0 ? totalDescuentos / facturasEmitidas : 0;
    const tasaAnulacion = (facturasEmitidas + facturasAnuladas) > 0 
      ? (facturasAnuladas / (facturasEmitidas + facturasAnuladas)) * 100 
      : 0;

    // Top 10 clientes
    const topClientes = Object.values(clientesMap)
      .sort((a, b) => b.totalFacturado - a.totalFacturado)
      .slice(0, 10);

    // Facturas por día (ordenadas)
    const facturasPorDiaArray = Object.values(facturasPorDia)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Rango de NCF
    const ncfOrdenados = ncfList.sort();
    const primerNCF = ncfOrdenados[0] || 'N/A';
    const ultimoNCF = ncfOrdenados[ncfOrdenados.length - 1] || 'N/A';

    // ============================================================
    // PREPARAR DETALLE DE FACTURAS
    // ============================================================
    const detalleFacturas = filteredInvoices.map(inv => ({
      id: inv.id,
      ncf: inv.ncf,
      fecha: inv.createdAt,
      cliente: inv.sale?.customer?.name || 'N/A',
      rncCliente: inv.sale?.customer?.rnc || 'N/A',
      subtotal: Number(inv.subtotal) || 0,
      itbis: Number(inv.itbis) || 0,
      itbisAmount: Number(inv.itbisAmount) || 0,
      discount: Number(inv.discount) || 0,
      discountAmount: Number(inv.discountAmount) || 0,
      total: Number(inv.total) || 0,
      status: inv.status,
      paymentMethod: inv.sale?.paymentMethod || 'N/A'
    }));

    // ============================================================
    // RESPUESTA
    // ============================================================
    res.json({
      summary: {
        totalFacturado,
        totalAnulado,
        facturasEmitidas,
        facturasAnuladas,
        promedioFactura,
        totalITBIS,
        totalDescuentos,
        promedioITBIS,
        promedioDescuento,
        tasaAnulacion,
        ncfConsumidos: ncfList.length,
        primerNCF,
        ultimoNCF
      },
      porFormaPago,
      topClientes,
      facturasPorDia: facturasPorDiaArray,
      detalleFacturas
    });

  } catch (error) {
    console.error('Error obteniendo reportes de facturación:', error);
    res.status(500).json({ 
      error: 'No se pudieron obtener los reportes', 
      detail: error.message 
    });
  }
});

/**
 * Obtener una factura por ID
 * GET /api/invoices/:id
 */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        sale: {
          include: {
            customer: true,
            saleitem: {
              include: {
                medicines: true
              }
            }
          }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({ 
        error: 'Factura no encontrada', 
        detail: `No existe una factura con ID ${id}` 
      });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error obteniendo factura:', error);
    res.status(500).json({ 
      error: 'No se pudo obtener la factura', 
      detail: error.message 
    });
  }
});

/**
 * Anular una factura
 * PUT /api/invoices/:id/cancel
 */
router.put('/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = req.body;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id }
    });

    if (!invoice) {
      return res.status(404).json({ 
        error: 'Factura no encontrada', 
        detail: `No existe una factura con ID ${id}` 
      });
    }

    if (invoice.status === 'anulada') {
      return res.status(400).json({ 
        error: 'Factura ya anulada', 
        detail: 'Esta factura ya fue anulada previamente' 
      });
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'anulada',
        notes: invoice.notes 
          ? `${invoice.notes}\n\nANULADA: ${reason || 'Sin motivo especificado'}`
          : `ANULADA: ${reason || 'Sin motivo especificado'}`
      }
    });

    res.json({ 
      ok: true, 
      invoice: updatedInvoice 
    });
  } catch (error) {
    console.error('Error anulando factura:', error);
    res.status(500).json({ 
      error: 'No se pudo anular la factura', 
      detail: error.message 
    });
  }
});

export default router;

