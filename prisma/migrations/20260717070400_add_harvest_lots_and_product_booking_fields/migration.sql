-- Pre-requisite for bookings: harvest lots + product reserve/availability fields

ALTER TABLE `products`
  ADD COLUMN `reserved_stock` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `availability_type` ENUM('READY', 'PRE_HARVEST', 'MIXED') NOT NULL DEFAULT 'READY',
  ADD COLUMN `next_harvest_date` DATETIME(3) NULL,
  ADD COLUMN `next_harvest_qty_ton` DECIMAL(15, 2) NULL;

CREATE INDEX `products_availability_type_idx` ON `products`(`availability_type`);
CREATE INDEX `products_next_harvest_date_idx` ON `products`(`next_harvest_date`);

CREATE TABLE `product_harvest_lots` (
  `id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `season_label` VARCHAR(191) NULL,
  `expected_harvest_date` DATETIME(3) NOT NULL,
  `expected_quantity_ton` DECIMAL(15, 2) NOT NULL,
  `reserved_quantity_ton` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `actual_harvest_date` DATETIME(3) NULL,
  `actual_quantity_ton` DECIMAL(15, 2) NULL,
  `status` ENUM('SCHEDULED', 'HARVESTING', 'HARVESTED', 'STOCKED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'SCHEDULED',
  `notes` TEXT NULL,
  `stocked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `product_harvest_lots_product_id_expected_harvest_date_idx`(`product_id`, `expected_harvest_date`),
  INDEX `product_harvest_lots_status_expected_harvest_date_idx`(`status`, `expected_harvest_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `product_harvest_lots`
  ADD CONSTRAINT `product_harvest_lots_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Notification types used by booking & partnership flows
ALTER TABLE `notifications`
  MODIFY `type` ENUM(
    'ORDER_STATUS',
    'PAYMENT_RECEIVED',
    'IOT_ALERT',
    'SYSTEM_ANNOUNCEMENT',
    'DISPUTE',
    'RFQ',
    'PARTNERSHIP',
    'BOOKING'
  ) NOT NULL;
