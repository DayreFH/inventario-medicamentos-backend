-- ============================================================
-- SCRIPT DE DATOS INICIALES PARA FACTURACIÓN
-- ============================================================
-- Este script inserta los datos iniciales necesarios para el
-- módulo de facturación
-- ============================================================

-- 1. Insertar métodos de pago por defecto
INSERT INTO payment_methods (name, displayName, isActive, sortOrder, created_at) VALUES
('efectivo', 'Efectivo', TRUE, 1, NOW()),
('tarjeta', 'Tarjeta de Crédito/Débito', TRUE, 2, NOW()),
('transferencia', 'Transferencia Bancaria', TRUE, 3, NOW()),
('credito', 'Crédito', TRUE, 4, NOW())
ON DUPLICATE KEY UPDATE 
  displayName = VALUES(displayName),
  isActive = VALUES(isActive),
  sortOrder = VALUES(sortOrder);

-- 2. Insertar configuración inicial de la empresa
-- (Solo si no existe ningún registro)
INSERT INTO company_settings (
  companyName, 
  invoicePrefix, 
  invoiceSequence, 
  taxRate,
  created_at,
  updated_at
)
SELECT 
  'Mi Empresa', 
  'FAC', 
  1, 
  0.00,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM company_settings LIMIT 1);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- Mostrar métodos de pago insertados
SELECT 'Métodos de pago insertados:' as mensaje;
SELECT id, name, displayName, isActive, sortOrder FROM payment_methods ORDER BY sortOrder;

-- Mostrar configuración de empresa
SELECT 'Configuración de empresa:' as mensaje;
SELECT id, companyName, invoicePrefix, invoiceSequence, taxRate FROM company_settings;

