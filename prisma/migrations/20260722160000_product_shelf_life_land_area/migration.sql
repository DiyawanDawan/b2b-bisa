-- AlterTable
ALTER TABLE `products`
  ADD COLUMN `shelf_life_days` INTEGER NULL,
  ADD COLUMN `land_area_ha` DECIMAL(15, 4) NULL;
