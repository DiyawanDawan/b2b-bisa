-- Fase 3 core domain admin: review moderation + RFQ flag/cancel metadata.
-- Idempotent adds so this can run safely on partially-migrated databases.

-- ---------------------------------------------------------------------------
-- Reviews: moderation fields
-- ---------------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'is_hidden'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `reviews` ADD COLUMN `is_hidden` BOOLEAN NOT NULL DEFAULT false', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'moderation_reason'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `reviews` ADD COLUMN `moderation_reason` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'moderated_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `reviews` ADD COLUMN `moderated_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'moderated_by_id'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `reviews` ADD COLUMN `moderated_by_id` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'is_flagged'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `reviews` ADD COLUMN `is_flagged` BOOLEAN NOT NULL DEFAULT false', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'flag_reason'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `reviews` ADD COLUMN `flag_reason` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'flagged_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `reviews` ADD COLUMN `flagged_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'reviews_is_hidden_idx'
);
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `reviews_is_hidden_idx` ON `reviews`(`is_hidden`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'reviews_is_flagged_idx'
);
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `reviews_is_flagged_idx` ON `reviews`(`is_flagged`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- RFQs: flag + cancel metadata
-- ---------------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rfqs' AND COLUMN_NAME = 'is_flagged'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `rfqs` ADD COLUMN `is_flagged` BOOLEAN NOT NULL DEFAULT false', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rfqs' AND COLUMN_NAME = 'flag_reason'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `rfqs` ADD COLUMN `flag_reason` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rfqs' AND COLUMN_NAME = 'flagged_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `rfqs` ADD COLUMN `flagged_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rfqs' AND COLUMN_NAME = 'cancel_reason'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `rfqs` ADD COLUMN `cancel_reason` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rfqs' AND COLUMN_NAME = 'cancelled_at'
);
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `rfqs` ADD COLUMN `cancelled_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rfqs' AND INDEX_NAME = 'rfqs_is_flagged_idx'
);
SET @sql := IF(@idx_exists = 0, 'CREATE INDEX `rfqs_is_flagged_idx` ON `rfqs`(`is_flagged`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
