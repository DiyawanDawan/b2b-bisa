-- Fase 2 partial admin modules: categories, forum groups, policies revisions,
-- partnership notes, market trend/snapshot metadata.

-- Categories: soft-active flag
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'is_active'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `categories` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND INDEX_NAME = 'categories_is_active_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `categories_is_active_idx` ON `categories`(`is_active`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Forum groups: active flag
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_groups' AND COLUMN_NAME = 'is_active'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `forum_groups` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_groups' AND INDEX_NAME = 'forum_groups_is_active_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `forum_groups_is_active_idx` ON `forum_groups`(`is_active`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Partnerships: internal notes
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'buyer_supplier_partnerships'
    AND COLUMN_NAME = 'internal_notes'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `buyer_supplier_partnerships` ADD COLUMN `internal_notes` TEXT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Policy revisions table
CREATE TABLE IF NOT EXISTS `policy_revisions` (
  `id` VARCHAR(191) NOT NULL,
  `policy_id` VARCHAR(191) NOT NULL,
  `version` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `is_published` BOOLEAN NOT NULL DEFAULT false,
  `created_by_id` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `policy_revisions_policy_id_idx`(`policy_id`),
  INDEX `policy_revisions_policy_id_created_at_idx`(`policy_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'policy_revisions'
    AND CONSTRAINT_NAME = 'policy_revisions_policy_id_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `policy_revisions` ADD CONSTRAINT `policy_revisions_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Market trends metadata
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_trends' AND COLUMN_NAME = 'period'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `market_trends` ADD COLUMN `period` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_trends' AND COLUMN_NAME = 'region'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `market_trends` ADD COLUMN `region` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_trends' AND COLUMN_NAME = 'commodity'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `market_trends` ADD COLUMN `commodity` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_trends' AND COLUMN_NAME = 'source'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `market_trends` ADD COLUMN `source` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_trends' AND COLUMN_NAME = 'is_published'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `market_trends` ADD COLUMN `is_published` BOOLEAN NOT NULL DEFAULT true',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_trends' AND COLUMN_NAME = 'created_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `market_trends` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_trends' AND INDEX_NAME = 'market_trends_category_idx'
);
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `market_trends_category_idx` ON `market_trends`(`category`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_trends' AND INDEX_NAME = 'market_trends_is_published_idx'
);
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `market_trends_is_published_idx` ON `market_trends`(`is_published`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_trends' AND INDEX_NAME = 'market_trends_region_idx'
);
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `market_trends_region_idx` ON `market_trends`(`region`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Supply-demand snapshot metadata
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_supply_demand_snapshots' AND COLUMN_NAME = 'period'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `market_supply_demand_snapshots` ADD COLUMN `period` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_supply_demand_snapshots' AND COLUMN_NAME = 'region'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `market_supply_demand_snapshots` ADD COLUMN `region` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'market_supply_demand_snapshots' AND COLUMN_NAME = 'source'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `market_supply_demand_snapshots` ADD COLUMN `source` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'market_supply_demand_snapshots'
    AND COLUMN_NAME = 'is_published'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `market_supply_demand_snapshots` ADD COLUMN `is_published` BOOLEAN NOT NULL DEFAULT true',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'market_supply_demand_snapshots'
    AND INDEX_NAME = 'market_supply_demand_snapshots_is_published_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `market_supply_demand_snapshots_is_published_idx` ON `market_supply_demand_snapshots`(`is_published`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'market_supply_demand_snapshots'
    AND INDEX_NAME = 'market_supply_demand_snapshots_region_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `market_supply_demand_snapshots_region_idx` ON `market_supply_demand_snapshots`(`region`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
