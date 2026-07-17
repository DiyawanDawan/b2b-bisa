CREATE TABLE `bookings` (
  `id` VARCHAR(191) NOT NULL,
  `booking_number` VARCHAR(191) NOT NULL,
  `buyer_id` VARCHAR(191) NOT NULL,
  `supplier_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `harvest_lot_id` VARCHAR(191) NULL,
  `product_mode` ENUM('BIOMASS_MATERIAL', 'ORGANIC_PRODUCE') NOT NULL,
  `quantity` DECIMAL(15, 2) NOT NULL,
  `unit` ENUM('KG', 'TON') NOT NULL,
  `price_snapshot` DECIMAL(15, 2) NOT NULL,
  `subtotal_snapshot` DECIMAL(15, 2) NOT NULL,
  `status` ENUM('PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'FULFILLED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `expires_at` DATETIME(3) NOT NULL,
  `expected_delivery_date` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `order_id` VARCHAR(191) NULL,
  `cancelled_by_id` VARCHAR(191) NULL,
  `cancel_reason` TEXT NULL,
  `confirmed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `bookings_booking_number_key`(`booking_number`),
  UNIQUE INDEX `bookings_order_id_key`(`order_id`),
  INDEX `bookings_buyer_id_status_idx`(`buyer_id`, `status`),
  INDEX `bookings_supplier_id_status_idx`(`supplier_id`, `status`),
  INDEX `bookings_product_id_idx`(`product_id`),
  INDEX `bookings_status_expires_at_idx`(`status`, `expires_at`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `bookings`
  ADD CONSTRAINT `bookings_buyer_id_fkey`
    FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `bookings_supplier_id_fkey`
    FOREIGN KEY (`supplier_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `bookings_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `bookings_harvest_lot_id_fkey`
    FOREIGN KEY (`harvest_lot_id`) REFERENCES `product_harvest_lots`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `bookings_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
