import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

/**
 * Obtener configuración de la empresa
 * GET /api/company
 */
router.get('/', async (req, res) => {
  try {
    // Buscar la configuración (solo debe haber un registro)
    let settings = await prisma.companySettings.findFirst();

    // Si no existe, crear una con valores por defecto
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          companyName: 'Mi Empresa',
          rnc: '',
          address: '',
          phone: '',
          email: '',
          logo: null,
          invoicePrefix: 'FAC',
          invoiceSequence: 1,
          taxRate: 0,
          footerText: 'Gracias por su preferencia'
        }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Error obteniendo configuración de empresa:', error);
    res.status(500).json({ 
      error: 'No se pudo obtener la configuración', 
      detail: error.message 
    });
  }
});

/**
 * Actualizar configuración de la empresa
 * PUT /api/company
 * body: { companyName, rnc, address, phone, email, logo, invoicePrefix, taxRate, footerText }
 */
router.put('/', async (req, res) => {
  const { 
    companyName, 
    rnc, 
    address, 
    phone, 
    email, 
    logo, 
    invoicePrefix, 
    taxRate, 
    footerText 
  } = req.body;

  try {
    // Buscar si existe configuración
    let settings = await prisma.companySettings.findFirst();

    if (settings) {
      // Actualizar existente
      settings = await prisma.companySettings.update({
        where: { id: settings.id },
        data: {
          companyName: companyName || settings.companyName,
          rnc: rnc !== undefined ? rnc : settings.rnc,
          address: address !== undefined ? address : settings.address,
          phone: phone !== undefined ? phone : settings.phone,
          email: email !== undefined ? email : settings.email,
          logo: logo !== undefined ? logo : settings.logo,
          invoicePrefix: invoicePrefix || settings.invoicePrefix,
          taxRate: taxRate !== undefined ? Number(taxRate) : settings.taxRate,
          footerText: footerText !== undefined ? footerText : settings.footerText
        }
      });
    } else {
      // Crear nuevo
      settings = await prisma.companySettings.create({
        data: {
          companyName: companyName || 'Mi Empresa',
          rnc: rnc || '',
          address: address || '',
          phone: phone || '',
          email: email || '',
          logo: logo || null,
          invoicePrefix: invoicePrefix || 'FAC',
          invoiceSequence: 1,
          taxRate: taxRate !== undefined ? Number(taxRate) : 0,
          footerText: footerText || 'Gracias por su preferencia'
        }
      });
    }

    res.json({ 
      ok: true, 
      message: 'Configuración actualizada correctamente',
      settings 
    });
  } catch (error) {
    console.error('Error actualizando configuración de empresa:', error);
    res.status(500).json({ 
      error: 'No se pudo actualizar la configuración', 
      detail: error.message 
    });
  }
});

/**
 * Test endpoint
 * GET /api/company/test
 */
router.get('/test', async (req, res) => {
  res.json({ ok: true, message: 'Company routes working' });
});

export default router;


