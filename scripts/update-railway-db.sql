-- ============================================================
-- SCRIPT DE ACTUALIZACIÓN DE BASE DE DATOS PARA RAILWAY
-- Fecha: 28 de diciembre de 2025
-- Descripción: Agrega tablas para facturación, configuración y métodos de pago
-- ============================================================

-- 1. Crear tabla company_settings
CREATE TABLE IF NOT EXISTS `company_settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `companyName` VARCHAR(191) NOT NULL DEFAULT 'Mi Empresa',
  `rnc` VARCHAR(191),
  `address` TEXT,
  `phone` VARCHAR(191),
  `email` VARCHAR(191),
  `logo` TEXT,
  `invoicePrefix` VARCHAR(191) NOT NULL DEFAULT 'FAC',
  `invoiceSequence` INT NOT NULL DEFAULT 1,
  `taxRate` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `footerText` TEXT,
  `autoGenerateNCF` BOOLEAN NOT NULL DEFAULT true,
  `ncfType` VARCHAR(191) NOT NULL DEFAULT 'B01',
  `ncfSequence` INT NOT NULL DEFAULT 1,
  `ncfPrefix` VARCHAR(191) NOT NULL DEFAULT 'B01',
  `ncfRangeStart` VARCHAR(191),
  `ncfRangeEnd` VARCHAR(191),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Crear tabla payment_methods
CREATE TABLE IF NOT EXISTS `payment_methods` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL UNIQUE,
  `displayName` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Crear tabla invoices
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `saleId` INT NOT NULL UNIQUE,
  `ncf` VARCHAR(191) NOT NULL,
  `subtotal` DECIMAL(10,2) NOT NULL,
  `itbis` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `itbisAmount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `discount` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `discountAmount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(10,2) NOT NULL,
  `notes` TEXT,
  `status` VARCHAR(191) NOT NULL DEFAULT 'emitida',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `invoices_saleId_idx` (`saleId`),
  INDEX `invoices_ncf_idx` (`ncf`),
  CONSTRAINT `invoices_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sale`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Modificar tabla customer (agregar columnas si no existen)
SET @dbname = DATABASE();
SET @tablename = 'customer';
SET @columnname = 'rnc';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(191);')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'fiscalAddress';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' TEXT;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 5. Modificar tabla sale (agregar columna si no existe)
SET @tablename = 'sale';
SET @columnname = 'paymentMethod';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(191) DEFAULT ''efectivo'';')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 6. Insertar métodos de pago por defecto
INSERT IGNORE INTO `payment_methods` (`name`, `displayName`, `isActive`, `sortOrder`) VALUES
('efectivo', 'Efectivo', 1, 1),
('tarjeta', 'Tarjeta de Crédito/Débito', 1, 2),
('transferencia', 'Transferencia Bancaria', 1, 3),
('cheque', 'Cheque', 1, 4),
('credito', 'Crédito', 1, 5);

-- 7. Insertar configuración de empresa por defecto (solo si no existe)
INSERT INTO `company_settings` (
  `id`,
  `companyName`, 
  `invoicePrefix`, 
  `invoiceSequence`, 
  `taxRate`,
  `autoGenerateNCF`,
  `ncfType`,
  `ncfSequence`,
  `ncfPrefix`,
  `updated_at`
)
SELECT 1, 'Mi Empresa', 'FAC', 1, 18.00, true, 'B01', 1, 'B01', NOW()
WHERE NOT EXISTS (SELECT 1 FROM `company_settings` WHERE `id` = 1);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- Mostrar tablas creadas
SELECT 'Tablas creadas:' AS '';
SHOW TABLES LIKE '%company_settings%';
SHOW TABLES LIKE '%payment_methods%';
SHOW TABLES LIKE '%invoices%';

-- Mostrar métodos de pago insertados
SELECT 'Métodos de pago:' AS '';
SELECT * FROM `payment_methods`;

-- Mostrar configuración de empresa
SELECT 'Configuración de empresa:' AS '';
SELECT * FROM `company_settings`;

-- Verificar columnas agregadas
SELECT 'Columnas de customer:' AS '';
DESCRIBE `customer`;

SELECT 'Columnas de sale:' AS '';
DESCRIBE `sale`;

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================

