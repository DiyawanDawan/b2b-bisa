-- AlterTable
ALTER TABLE `iot_devices` ADD COLUMN `threshold_max` DECIMAL(15, 2) NULL DEFAULT 600,
    ADD COLUMN `threshold_min` DECIMAL(15, 2) NULL DEFAULT 200;
