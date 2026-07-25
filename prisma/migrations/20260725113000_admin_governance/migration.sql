-- Fase 4 governance: supplier API key scopes/revocation metadata + platform bank account currency.

-- Supplier API keys: scopes
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_api_keys' AND COLUMN_NAME = 'scopes'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `supplier_api_keys` ADD COLUMN `scopes` JSON NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Supplier API keys: revoked_at
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_api_keys' AND COLUMN_NAME = 'revoked_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `supplier_api_keys` ADD COLUMN `revoked_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Supplier API keys: rotated_at
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_api_keys' AND COLUMN_NAME = 'rotated_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `supplier_api_keys` ADD COLUMN `rotated_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Platform bank accounts: currency
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_bank_accounts' AND COLUMN_NAME = 'currency'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `platform_bank_accounts` ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT ''IDR''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
