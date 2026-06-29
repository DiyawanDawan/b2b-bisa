-- Multi-supplier checkout batch fields (schema drift fix)
ALTER TABLE `orders`
  ADD COLUMN `checkout_batch_id` VARCHAR(191) NULL,
  ADD COLUMN `checkout_batch_number` VARCHAR(191) NULL;

CREATE INDEX `orders_checkout_batch_id_idx` ON `orders`(`checkout_batch_id`);
