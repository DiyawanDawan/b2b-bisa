-- AlterTable
ALTER TABLE `platform_fee_settings`
  ADD COLUMN `apply_mode` VARCHAR(191) NOT NULL DEFAULT 'AUTO',
  ADD COLUMN `apply_scopes` JSON NULL;
