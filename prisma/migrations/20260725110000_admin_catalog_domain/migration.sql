-- Fase 3 catalog/content admin: harvest lots archive, collections schedule,
-- store-banner moderation, product Q&A moderation.

-- Harvest lots: archive flag
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_harvest_lots' AND COLUMN_NAME = 'archived_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product_harvest_lots` ADD COLUMN `archived_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_harvest_lots' AND INDEX_NAME = 'product_harvest_lots_archived_at_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `product_harvest_lots_archived_at_idx` ON `product_harvest_lots`(`archived_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Product collections: ordering + publish schedule
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_collections' AND COLUMN_NAME = 'sort_order'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product_collections` ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_collections' AND COLUMN_NAME = 'publish_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product_collections` ADD COLUMN `publish_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_collections' AND COLUMN_NAME = 'unpublish_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product_collections` ADD COLUMN `unpublish_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_collections' AND INDEX_NAME = 'product_collections_sort_order_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `product_collections_sort_order_idx` ON `product_collections`(`sort_order`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_collections'
    AND INDEX_NAME = 'product_collections_publish_at_unpublish_at_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `product_collections_publish_at_unpublish_at_idx` ON `product_collections`(`publish_at`, `unpublish_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Store banner moderation enum + columns
SET @enum_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_banners'
    AND COLUMN_NAME = 'moderation_status'
);
SET @sql := IF(
  @enum_exists = 0,
  'ALTER TABLE `store_banners` ADD COLUMN `moderation_status` ENUM(''PENDING'', ''APPROVED'', ''REJECTED'') NOT NULL DEFAULT ''APPROVED''',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_banners' AND COLUMN_NAME = 'starts_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `store_banners` ADD COLUMN `starts_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_banners' AND COLUMN_NAME = 'ends_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `store_banners` ADD COLUMN `ends_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_banners' AND COLUMN_NAME = 'reviewed_by_id'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `store_banners` ADD COLUMN `reviewed_by_id` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_banners' AND COLUMN_NAME = 'reviewed_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `store_banners` ADD COLUMN `reviewed_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_banners' AND COLUMN_NAME = 'rejection_reason'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `store_banners` ADD COLUMN `rejection_reason` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_banners'
    AND INDEX_NAME = 'store_banners_moderation_status_created_at_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `store_banners_moderation_status_created_at_idx` ON `store_banners`(`moderation_status`, `created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_banners'
    AND INDEX_NAME = 'store_banners_starts_at_ends_at_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `store_banners_starts_at_ends_at_idx` ON `store_banners`(`starts_at`, `ends_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_banners'
    AND CONSTRAINT_NAME = 'store_banners_reviewed_by_id_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `store_banners` ADD CONSTRAINT `store_banners_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `store_banner_moderation_history` (
  `id` VARCHAR(191) NOT NULL,
  `banner_id` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `from_status` ENUM('PENDING', 'APPROVED', 'REJECTED') NULL,
  `to_status` ENUM('PENDING', 'APPROVED', 'REJECTED') NULL,
  `note` TEXT NULL,
  `actor_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `store_banner_moderation_history_banner_id_created_at_idx`(`banner_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_banner_moderation_history'
    AND CONSTRAINT_NAME = 'store_banner_moderation_history_banner_id_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `store_banner_moderation_history` ADD CONSTRAINT `store_banner_moderation_history_banner_id_fkey` FOREIGN KEY (`banner_id`) REFERENCES `store_banners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'store_banner_moderation_history'
    AND CONSTRAINT_NAME = 'store_banner_moderation_history_actor_id_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `store_banner_moderation_history` ADD CONSTRAINT `store_banner_moderation_history_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Product Q&A moderation
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_questions' AND COLUMN_NAME = 'is_hidden'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product_questions` ADD COLUMN `is_hidden` BOOLEAN NOT NULL DEFAULT false',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_questions' AND COLUMN_NAME = 'is_flagged'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product_questions` ADD COLUMN `is_flagged` BOOLEAN NOT NULL DEFAULT false',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_questions' AND COLUMN_NAME = 'moderation_note'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product_questions` ADD COLUMN `moderation_note` TEXT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_questions' AND COLUMN_NAME = 'moderated_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product_questions` ADD COLUMN `moderated_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_questions' AND COLUMN_NAME = 'moderated_by_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product_questions` ADD COLUMN `moderated_by_id` VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_questions'
    AND INDEX_NAME = 'product_questions_is_hidden_is_flagged_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `product_questions_is_hidden_is_flagged_idx` ON `product_questions`(`is_hidden`, `is_flagged`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_questions'
    AND CONSTRAINT_NAME = 'product_questions_moderated_by_id_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `product_questions` ADD CONSTRAINT `product_questions_moderated_by_id_fkey` FOREIGN KEY (`moderated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
