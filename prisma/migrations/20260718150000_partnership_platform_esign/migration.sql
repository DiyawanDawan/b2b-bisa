-- Buyer–supplier partnership contracts (Mitra Utama).
-- Table was previously only created via local `db push`; production never had it.
-- This migration creates the full table (incl. 3-party e-sign + signer identity).

CREATE TABLE IF NOT EXISTS `buyer_supplier_partnerships` (
  `id` VARCHAR(191) NOT NULL,
  `contract_number` VARCHAR(191) NOT NULL,
  `buyer_id` VARCHAR(191) NOT NULL,
  `supplier_id` VARCHAR(191) NOT NULL,
  `tier` ENUM('MAIN_PARTNER', 'PREFERRED', 'STANDARD') NOT NULL DEFAULT 'MAIN_PARTNER',
  `status` ENUM(
    'PENDING',
    'AWAITING_SIGNATURE',
    'ACTIVE',
    'REJECTED',
    'TERMINATED',
    'EXPIRED',
    'RENEWAL_PENDING'
  ) NOT NULL DEFAULT 'PENDING',
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `product_category` VARCHAR(191) NULL,
  `estimated_monthly_qty` DECIMAL(15, 2) NULL,
  `price_agreement` TEXT NULL,
  `delivery_terms` TEXT NULL,
  `payment_terms` TEXT NULL,
  `special_terms` TEXT NULL,
  `start_date` DATETIME(3) NOT NULL,
  `end_date` DATETIME(3) NOT NULL,
  `buyer_signed_at` DATETIME(3) NULL,
  `seller_signed_at` DATETIME(3) NULL,
  `platform_signed_at` DATETIME(3) NULL,
  `buyer_sign_hash` VARCHAR(191) NULL,
  `seller_sign_hash` VARCHAR(191) NULL,
  `platform_sign_hash` VARCHAR(191) NULL,
  `platform_signer_id` VARCHAR(191) NULL,
  `buyer_signer_name` VARCHAR(191) NULL,
  `buyer_signer_title` VARCHAR(191) NULL,
  `buyer_company_name` VARCHAR(191) NULL,
  `seller_signer_name` VARCHAR(191) NULL,
  `seller_signer_title` VARCHAR(191) NULL,
  `seller_company_name` VARCHAR(191) NULL,
  `platform_signer_name` VARCHAR(191) NULL,
  `platform_signer_title` VARCHAR(191) NULL,
  `is_fully_signed` BOOLEAN NOT NULL DEFAULT false,
  `renewal_count` INTEGER NOT NULL DEFAULT 0,
  `renewal_proposed_end_date` DATETIME(3) NULL,
  `renewal_requested_by` VARCHAR(191) NULL,
  `renewal_requested_at` DATETIME(3) NULL,
  `renewal_note` TEXT NULL,
  `renewed_from_id` VARCHAR(191) NULL,
  `originating_negotiation_id` VARCHAR(191) NULL,
  `originating_order_id` VARCHAR(191) NULL,
  `initiated_by` VARCHAR(191) NOT NULL,
  `rejection_reason` TEXT NULL,
  `terminated_at` DATETIME(3) NULL,
  `terminated_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `buyer_supplier_partnerships_contract_number_key`(`contract_number`),
  INDEX `buyer_supplier_partnerships_buyer_id_idx`(`buyer_id`),
  INDEX `buyer_supplier_partnerships_supplier_id_idx`(`supplier_id`),
  INDEX `buyer_supplier_partnerships_status_idx`(`status`),
  INDEX `buyer_supplier_partnerships_buyer_id_supplier_id_idx`(`buyer_id`, `supplier_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Idempotent column adds for DBs that already had an older table (local db push).
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'platform_signed_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `platform_signed_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'platform_sign_hash'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `platform_sign_hash` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'platform_signer_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `platform_signer_id` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'buyer_signer_name'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `buyer_signer_name` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'buyer_signer_title'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `buyer_signer_title` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'buyer_company_name'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `buyer_company_name` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'seller_signer_name'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `seller_signer_name` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'seller_signer_title'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `seller_signer_title` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'seller_company_name'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `seller_company_name` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'platform_signer_name'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `platform_signer_name` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'platform_signer_title'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `platform_signer_title` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign keys (idempotent)
SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND CONSTRAINT_NAME = 'buyer_supplier_partnerships_buyer_id_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD CONSTRAINT `buyer_supplier_partnerships_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND CONSTRAINT_NAME = 'buyer_supplier_partnerships_supplier_id_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD CONSTRAINT `buyer_supplier_partnerships_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
