-- Jenis ruang chat: tanya produk vs negosiasi harga (bukan tag di specifications).
-- Idempotent: skip ADD COLUMN if already applied (partial recovery / manual sync).
SET @room_type_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'negotiations'
    AND COLUMN_NAME = 'room_type'
);

SET @add_room_type_sql := IF(
  @room_type_exists = 0,
  'ALTER TABLE `negotiations` ADD COLUMN `room_type` ENUM(''INQUIRY'', ''NEGOTIATION'') NOT NULL DEFAULT ''NEGOTIATION''',
  'SELECT 1'
);
PREPARE stmt FROM @add_room_type_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `negotiations`
SET `room_type` = 'INQUIRY'
WHERE `specifications` LIKE 'PURPOSE:INQUIRY%';

UPDATE `negotiations`
SET `specifications` = NULL
WHERE `specifications` = 'PURPOSE:INQUIRY';

UPDATE `negotiations`
SET `specifications` = TRIM(LEADING '\n' FROM SUBSTRING(`specifications`, LENGTH('PURPOSE:INQUIRY') + 1))
WHERE `specifications` LIKE 'PURPOSE:INQUIRY\n%';

UPDATE `negotiations`
SET `specifications` = NULL
WHERE `specifications` = 'PURPOSE:NEGOTIATION';

UPDATE `negotiations`
SET `specifications` = TRIM(LEADING '\n' FROM SUBSTRING(`specifications`, LENGTH('PURPOSE:NEGOTIATION') + 1))
WHERE `specifications` LIKE 'PURPOSE:NEGOTIATION\n%';

SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'negotiations'
    AND INDEX_NAME = 'negotiations_buyer_id_product_id_room_type_status_idx'
);

SET @add_idx_sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `negotiations_buyer_id_product_id_room_type_status_idx` ON `negotiations`(`buyer_id`, `product_id`, `room_type`, `status`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
