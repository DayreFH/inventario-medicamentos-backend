import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/topbar/metrics - Obtener métricas rápidas
router.get('/metrics', authenticate, async (req, res) => {
  try {
    // Contar total de medicamentos
    const totalMedicines = await prisma.Medicine.count();

    // Contar alertas activas (medicamentos con stock bajo o próximos a vencer)
    const lowStockCount = await prisma.Medicine.count({
      where: {
        stock: {
          gt: 0,   // Stock mayor a 0
          lte: 10  // Pero menor o igual a 10
        },
        receiptitem: {
          some: {}  // Solo medicamentos con entradas
        }
      }
    });

    // Medicamentos próximos a vencer (30 días)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringCount = await prisma.Medicine.count({
      where: {
        fechaVencimiento: {
          lte: thirtyDaysFromNow,
          gte: new Date()
        },
        stock: {
          gt: 0  // Solo medicamentos con stock disponible
        }
      }
    });

    const activeAlerts = lowStockCount + expiringCount;

    res.json({
      success: true,
      data: {
        totalMedicines,
        activeAlerts,
        lowStockCount,
        expiringCount
      }
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener métricas',
      error: error.message
    });
  }
});

// GET /api/topbar/notifications - Obtener notificaciones
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const notifications = [];

    // Medicamentos próximos a vencer (7 días)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringMedicines = await prisma.Medicine.findMany({
      where: {
        fechaVencimiento: {
          lte: sevenDaysFromNow,
          gte: new Date()
        },
        stock: {
          gt: 0  // Solo medicamentos con stock disponible
        }
      },
      take: 5,
      orderBy: {
        fechaVencimiento: 'asc'
      }
    });

    if (expiringMedicines.length > 0) {
      notifications.push({
        id: `expiring-${Date.now()}`,
        type: 'warning',
        icon: '⚠️',
        title: `${expiringMedicines.length} medicamentos por vencer`,
        message: 'Vencen en los próximos 7 días',
        time: 'Ahora',
        read: false,
        link: '/expiry-alerts'
      });
    }

    // Medicamentos con stock bajo
    const lowStockMedicines = await prisma.Medicine.findMany({
      where: {
        stock: {
          gt: 0,   // Stock mayor a 0 (no agotados)
          lte: 10  // Pero menor o igual a 10 (stock bajo)
        },
        receiptitem: {
          some: {}  // Solo medicamentos que tienen al menos una entrada
        }
      },
      take: 5,
      orderBy: {
        stock: 'asc'
      }
    });

    lowStockMedicines.forEach((med) => {
      notifications.push({
        id: `low-stock-${med.id}`,
        type: 'danger',
        icon: '📉',
        title: `Stock bajo: ${med.nombreComercial}`,
        message: `Solo quedan ${med.stock} unidades`,
        time: 'Ahora',
        read: false,
        link: '/medicines'
      });
    });

    // 🚫 Medicamentos vencidos (ya vencieron)
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Inicio del día

    const expiredMedicines = await prisma.Medicine.findMany({
      where: {
        fechaVencimiento: {
          lt: today  // Menor que hoy (ya vencidos)
        },
        stock: {
          gt: 0  // Solo los que aún tienen stock
        }
      },
      orderBy: {
        fechaVencimiento: 'asc'  // Los más antiguos primero
      },
      take: 5
    });

    if (expiredMedicines.length > 0) {
      notifications.push({
        id: `expired-medicines-${Date.now()}`,
        type: 'danger',
        icon: '🚫',
        title: `${expiredMedicines.length} medicamentos vencidos`,
        message: 'Retirar del inventario inmediatamente',
        time: 'Ahora',
        read: false,
        link: '/medicines'
      });
    }

    // 💰 Ventas del día
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todaySales = await prisma.sale.findMany({
      where: {
        date: {
          gte: todayStart,
          lt: todayEnd
        }
      },
      include: {
        saleitem: true
      }
    });

    // Calcular total de ventas del día
    let totalAmount = 0;
    let totalItems = 0;

    todaySales.forEach(sale => {
      sale.saleitem.forEach(item => {
        const precio = item.precio_propuesto_usd || 0;
        totalAmount += Number(precio) * item.qty;
        totalItems += item.qty;
      });
    });

    const salesCount = todaySales.length;

    if (salesCount > 0) {
      notifications.push({
        id: `daily-sales-${Date.now()}`,
        type: 'success',
        icon: '💰',
        title: `Ventas de hoy: $${totalAmount.toFixed(2)} USD`,
        message: `${salesCount} transacciones · ${totalItems} productos`,
        time: 'Ahora',
        read: false,
        link: '/sales'
      });
    }

    // ⏱️ Medicamentos sin movimiento (90+ días)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Query optimizada: buscar medicamentos con stock que no tienen ventas recientes
    const idleMedicines = await prisma.Medicine.findMany({
      where: {
        stock: { gt: 0 },  // Solo con stock disponible
        receiptitem: { some: {} },  // Que tengan entradas
        OR: [
          {
            // Medicamentos que nunca se han vendido
            saleitem: { none: {} }
          },
          {
            // O medicamentos cuya última venta fue hace más de 90 días
            saleitem: {
              every: {
                sale: {
                  date: { lt: ninetyDaysAgo }
                }
              }
            }
          }
        ]
      },
      take: 10  // Limitar para no sobrecargar
    });

    if (idleMedicines.length > 0) {
      notifications.push({
        id: `idle-medicines-${Date.now()}`,
        type: 'warning',
        icon: '⏱️',
        title: `${idleMedicines.length} medicamentos sin movimiento`,
        message: 'Sin ventas en 90+ días',
        time: 'Ahora',
        read: false,
        link: '/idle-medicines'
      });
    }

    // Limitar a 10 notificaciones
    const limitedNotifications = notifications.slice(0, 10);

    res.json({
      success: true,
      data: limitedNotifications
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener notificaciones',
      error: error.message
    });
  }
});

// GET /api/topbar/search - Búsqueda global
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    console.log('🔍 Búsqueda recibida:', q);

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        results: []
      });
    }

    const searchTerm = q.trim().toLowerCase();
    const results = [];

    // Buscar medicamentos
    console.log('🔍 Buscando medicamentos...');
    const medicines = await prisma.Medicine.findMany({
      where: {
        OR: [
          { nombreComercial: { contains: searchTerm } },
          { nombreGenerico: { contains: searchTerm } },
          { codigo: { contains: searchTerm } }
        ]
      },
      take: 5
    });

    medicines.forEach((med) => {
      results.push({
        type: 'medicine',
        icon: '💊',
        title: med.nombreComercial,
        subtitle: `Código: ${med.codigo} | Stock: ${med.stock}`,
        path: '/medicines'
      });
    });

    // Buscar clientes
    console.log('🔍 Buscando clientes...');
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm } },
          { email: { contains: searchTerm } }
        ]
      },
      take: 5
    });

    customers.forEach((customer) => {
      results.push({
        type: 'customer',
        icon: '👤',
        title: customer.name,
        subtitle: `Email: ${customer.email || 'N/A'}`,
        path: '/customers'
      });
    });

    // Buscar ventas (por número de factura)
    console.log('🔍 Buscando ventas...');
    if (!isNaN(searchTerm)) {
      const sales = await prisma.sale.findMany({
        where: {
          id: parseInt(searchTerm)
        },
        include: {
          customer: true
        },
        take: 5
      });

      sales.forEach((sale) => {
        results.push({
          type: 'sale',
          icon: '📄',
          title: `Venta #${sale.id}`,
          subtitle: `Cliente: ${sale.customer?.name || 'N/A'} | $${sale.total}`,
          path: '/sales'
        });
      });
    }

    console.log(`✅ Búsqueda completada: ${results.length} resultados encontrados`);
    res.json({
      success: true,
      results: results.slice(0, 10) // Limitar a 10 resultados
    });
  } catch (error) {
    console.error('❌ Error en búsqueda:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error en la búsqueda',
      error: error.message
    });
  }
});

// PUT /api/topbar/notifications/:id/read - Marcar notificación como leída
router.put('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    // Por ahora solo retornamos éxito
    // En el futuro se puede implementar una tabla de notificaciones
    res.json({
      success: true,
      message: 'Notificación marcada como leída'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error al marcar notificación',
      error: error.message
    });
  }
});

export default router;

