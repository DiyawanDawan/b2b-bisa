-- AlterEnum
ALTER TABLE `vouchers` MODIFY COLUMN `scope` ENUM('PLATFORM', 'SUPPLIER', 'CATEGORY', 'PRODUCT', 'PRODUCT_MODE') NOT NULL DEFAULT 'PLATFORM';

-- AlterTable
ALTER TABLE `vouchers`
  ADD COLUMN `category_id` VARCHAR(191) NULL,
  ADD COLUMN `product_id` VARCHAR(191) NULL,
  ADD COLUMN `product_mode` ENUM('BIOMASS_MATERIAL', 'ORGANIC_PRODUCE') NULL;

-- CreateIndex
CREATE INDEX `vouchers_category_id_idx` ON `vouchers`(`category_id`);

-- CreateIndex
CREATE INDEX `vouchers_product_id_idx` ON `vouchers`(`product_id`);

-- CreateIndex
CREATE INDEX `vouchers_product_mode_idx` ON `vouchers`(`product_mode`);

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
