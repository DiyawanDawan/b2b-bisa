ALTER TABLE `iot_devices`
  MODIFY `user_id` VARCHAR(191) NULL,
  ADD COLUMN `device_secret` VARCHAR(191) NULL AFTER `device_id`,
  ADD COLUMN `owned_at` DATETIME(3) NULL AFTER `threshold_max`;

UPDATE `iot_devices`
SET `device_secret` = LOWER(SHA2(CONCAT(`id`, ':', `device_id`, ':', COALESCE(`created_at`, NOW(6))), 256))
WHERE `device_secret` IS NULL;

UPDATE `iot_devices`
SET `owned_at` = COALESCE(`owned_at`, `updated_at`, `created_at`, NOW(6))
WHERE `user_id` IS NOT NULL;

ALTER TABLE `iot_devices`
  MODIFY `device_secret` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `iot_devices_device_secret_key` ON `iot_devices`(`device_secret`);
CREATE INDEX `iot_devices_device_secret_idx` ON `iot_devices`(`device_secret`);
