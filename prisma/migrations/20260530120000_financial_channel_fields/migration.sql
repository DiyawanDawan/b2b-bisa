-- AlterTable: payment_channels — Xendit metadata from CSV
ALTER TABLE `payment_channels`
    ADD COLUMN `country` VARCHAR(191) NULL DEFAULT 'ID',
    ADD COLUMN `currency` VARCHAR(191) NULL DEFAULT 'IDR',
    ADD COLUMN `min_amount` DECIMAL(15, 2) NULL,
    ADD COLUMN `max_amount` DECIMAL(15, 2) NULL,
    ADD COLUMN `settlement_time` VARCHAR(191) NULL,
    ADD COLUMN `xendit_type` VARCHAR(191) NULL;

CREATE INDEX `payment_channels_country_is_active_idx` ON `payment_channels`(`country`, `is_active`);

-- AlterTable: payout_banks — Xendit payout metadata from CSV
ALTER TABLE `payout_banks`
    ADD COLUMN `channel_type` VARCHAR(191) NULL,
    ADD COLUMN `country` VARCHAR(191) NULL DEFAULT 'ID',
    ADD COLUMN `currency` VARCHAR(191) NULL DEFAULT 'IDR',
    ADD COLUMN `min_amount` DECIMAL(15, 2) NULL,
    ADD COLUMN `max_amount` DECIMAL(15, 2) NULL,
    ADD COLUMN `flight_time` VARCHAR(191) NULL;

CREATE INDEX `payout_banks_country_is_active_idx` ON `payout_banks`(`country`, `is_active`);
