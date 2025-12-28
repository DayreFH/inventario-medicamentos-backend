import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/**
 * GET /api/company-settings
 * Obtiene la configuración de la empresa
 */
router.get('/', async (req, res) => {
  try {
    // Buscar la configuración (solo debe haber un registro)
    let settings = await prisma.companySettings.findFirst();
    
    // Si no existe, crear una por defecto
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          companyName: 'Mi Empresa',
          invoicePrefix: 'FAC',
          invoiceSequence: 1,
          taxRate: 0
        }
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error obteniendo configuración de empresa:', error);
    res.status(500).json({ 
      error: 'Error obteniendo configuración de empresa', 
      detail: error.message 
    });
  }
});

/**
 * PUT /api/company-settings
 * Actualiza la configuración de la empresa
 */
router.put('/', async (req, res) => {
  try {
    const {
      companyName,
      rnc,
      address,
      phone,
      email,
      logo,
      invoicePrefix,
      taxRate,
      footerText,
      // Nuevos campos para NCF automático
      autoGenerateNCF,
      ncfType,
      ncfPrefix,
      ncfRangeStart,
      ncfRangeEnd
    } = req.body;
    
    // Validaciones básicas
    if (companyName && companyName.trim().length === 0) {
      return res.status(400).json({ error: 'El nombre de la empresa es obligatorio' });
    }
    
    if (invoicePrefix && invoicePrefix.trim().length === 0) {
      return res.status(400).json({ error: 'El prefijo de factura es obligatorio' });
    }
    
    if (taxRate !== undefined && (taxRate < 0 || taxRate > 100)) {
      return res.status(400).json({ error: 'La tasa de impuesto debe estar entre 0 y 100' });
    }
    
    // Validaciones para NCF
    if (ncfType && !['B01', 'B02', 'B14', 'B15'].includes(ncfType)) {
      return res.status(400).json({ error: 'Tipo de NCF inválido. Debe ser B01, B02, B14 o B15' });
    }
    
    // Buscar configuración existente
    const existing = await prisma.companySettings.findFirst();
    
    let settings;
    if (existing) {
      // Actualizar existente
      settings = await prisma.companySettings.update({
        where: { id: existing.id },
        data: {
          ...(companyName !== undefined && { companyName: companyName.trim() }),
          ...(rnc !== undefined && { rnc: rnc?.trim() || null }),
          ...(address !== undefined && { address: address?.trim() || null }),
          ...(phone !== undefined && { phone: phone?.trim() || null }),
          ...(email !== undefined && { email: email?.trim() || null }),
          ...(logo !== undefined && { logo: logo || null }),
          ...(invoicePrefix !== undefined && { invoicePrefix: invoicePrefix.trim().toUpperCase() }),
          ...(taxRate !== undefined && { taxRate }),
          ...(footerText !== undefined && { footerText: footerText?.trim() || null }),
          // Campos de NCF automático
          ...(autoGenerateNCF !== undefined && { autoGenerateNCF }),
          ...(ncfType !== undefined && { ncfType: ncfType.toUpperCase() }),
          ...(ncfPrefix !== undefined && { ncfPrefix: ncfPrefix.toUpperCase() }),
          ...(ncfRangeStart !== undefined && { ncfRangeStart: ncfRangeStart?.trim() || null }),
          ...(ncfRangeEnd !== undefined && { ncfRangeEnd: ncfRangeEnd?.trim() || null })
        }
      });
    } else {
      // Crear nuevo
      settings = await prisma.companySettings.create({
        data: {
          companyName: companyName?.trim() || 'Mi Empresa',
          rnc: rnc?.trim() || null,
          address: address?.trim() || null,
          phone: phone?.trim() || null,
          email: email?.trim() || null,
          logo: logo || null,
          invoicePrefix: invoicePrefix?.trim().toUpperCase() || 'FAC',
          invoiceSequence: 1,
          taxRate: taxRate || 0,
          footerText: footerText?.trim() || null,
          // Campos de NCF automático con valores por defecto
          autoGenerateNCF: autoGenerateNCF !== undefined ? autoGenerateNCF : true,
          ncfType: ncfType?.toUpperCase() || 'B01',
          ncfPrefix: ncfPrefix?.toUpperCase() || 'B01',
          ncfSequence: 1,
          ncfRangeStart: ncfRangeStart?.trim() || null,
          ncfRangeEnd: ncfRangeEnd?.trim() || null
        }
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error actualizando configuración de empresa:', error);
    res.status(500).json({ 
      error: 'Error actualizando configuración de empresa', 
      detail: error.message 
    });
  }
});

/**
 * GET /api/company-settings/next-invoice-number
 * Obtiene el próximo número de factura disponible
 */
router.get('/next-invoice-number', async (req, res) => {
  try {
    const settings = await prisma.companySettings.findFirst();
    
    if (!settings) {
      return res.status(404).json({ error: 'Configuración de empresa no encontrada' });
    }
    
    // Formatear número con ceros a la izquierda (5 dígitos)
    const paddedNumber = String(settings.invoiceSequence).padStart(5, '0');
    const nextNumber = `${settings.invoicePrefix}-${paddedNumber}`;
    
    res.json({ 
      nextNumber,
      prefix: settings.invoicePrefix,
      sequence: settings.invoiceSequence
    });
  } catch (error) {
    console.error('Error obteniendo próximo número de factura:', error);
    res.status(500).json({ 
      error: 'Error obteniendo próximo número de factura', 
      detail: error.message 
    });
  }
});

/**
 * GET /api/company-settings/next-ncf
 * Obtiene el próximo NCF disponible (solo si está activada la generación automática)
 */
router.get('/next-ncf', async (req, res) => {
  try {
    const settings = await prisma.companySettings.findFirst();
    
    if (!settings) {
      return res.status(404).json({ error: 'Configuración de empresa no encontrada' });
    }
    
    if (!settings.autoGenerateNCF) {
      return res.json({ 
        autoGenerate: false,
        message: 'La generación automática de NCF está desactivada'
      });
    }
    
    // Formatear NCF: Tipo + 8 dígitos (ej: B0100000001)
    const paddedSequence = String(settings.ncfSequence).padStart(8, '0');
    const nextNCF = `${settings.ncfPrefix}${paddedSequence}`;
    
    // Verificar si está dentro del rango autorizado (si existe)
    let withinRange = true;
    let warning = null;
    
    if (settings.ncfRangeStart && settings.ncfRangeEnd) {
      const currentNumber = parseInt(paddedSequence);
      const rangeStart = parseInt(settings.ncfRangeStart.slice(-8));
      const rangeEnd = parseInt(settings.ncfRangeEnd.slice(-8));
      
      if (currentNumber < rangeStart || currentNumber > rangeEnd) {
        withinRange = false;
        warning = `NCF fuera del rango autorizado (${settings.ncfRangeStart} - ${settings.ncfRangeEnd})`;
      }
      
      // Advertencia si quedan pocos NCF
      const remaining = rangeEnd - currentNumber;
      if (remaining <= 10 && remaining > 0) {
        warning = `⚠️ Quedan solo ${remaining} NCF disponibles en el rango autorizado`;
      }
    }
    
    res.json({ 
      autoGenerate: true,
      nextNCF,
      ncfType: settings.ncfType,
      ncfPrefix: settings.ncfPrefix,
      ncfSequence: settings.ncfSequence,
      withinRange,
      warning,
      rangeStart: settings.ncfRangeStart,
      rangeEnd: settings.ncfRangeEnd
    });
  } catch (error) {
    console.error('Error obteniendo próximo NCF:', error);
    res.status(500).json({ 
      error: 'Error obteniendo próximo NCF', 
      detail: error.message 
    });
  }
});

export default router;

