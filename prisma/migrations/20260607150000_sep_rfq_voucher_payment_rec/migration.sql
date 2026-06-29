-- RFQ, Voucher, Saved Payment, Product Recommendations support (Sep 2026)

-- AlterEnum NotificationType
ALTER TABLE `notifications` MODIFY `type` ENUM('ORDER_STATUS', 'PAYMENT_RECEIVED', 'IOT_ALERT', 'SYSTEM_ANNOUNCEMENT', 'DISPUTE', 'RFQ') NOT NULL;

-- Order voucher fields
ALTER TABLE `orders` ADD COLUMN `voucher_code` VARCHAR(191) NULL,
    ADD COLUMN `voucher_discount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- RFQ
CREATE TABLE `rfqs` (
    `id` VARCHAR(191) NOT NULL,
    `buyer_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `product_mode` ENUM('BIOMASS_MATERIAL', 'ORGANIC_PRODUCE') NOT NULL,
    `biomassa_type` ENUM('SEKAM_PADI', 'TONGKOL_JAGUNG', 'JERAMI', 'KAYU', 'LIMBAH_KELAPA_SAWIT', 'LIMBAH_KAYU', 'BIOCHAR') NULL,
    `category_id` VARCHAR(191) NULL,
    `quantity` DECIMAL(15, 2) NOT NULL,
    `specifications` TEXT NULL,
    `delivery_date` DATETIME(3) NULL,
    `budget_max` DECIMAL(15, 2) NULL,
    `status` ENUM('OPEN', 'MATCHED', 'CLOSED', 'EXPIRED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `rfqs_buyer_id_status_idx`(`buyer_id`, `status`),
    INDEX `rfqs_product_mode_status_idx`(`product_mode`, `status`),
    INDEX `rfqs_created_at_idx`(`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `rfq_responses` (
    `id` VARCHAR(191) NOT NULL,
    `rfq_id` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NOT NULL,
    `negotiation_id` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `rfq_responses_negotiation_id_key`(`negotiation_id`),
    UNIQUE INDEX `rfq_responses_rfq_id_supplier_id_key`(`rfq_id`, `supplier_id`),
    INDEX `rfq_responses_supplier_id_idx`(`supplier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Vouchers
CREATE TABLE `vouchers` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `type` ENUM('PERCENT', 'FIXED') NOT NULL,
    `value` DECIMAL(15, 2) NOT NULL,
    `min_order_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `max_discount` DECIMAL(15, 2) NULL,
    `scope` ENUM('PLATFORM', 'SUPPLIER') NOT NULL DEFAULT 'PLATFORM',
    `supplier_id` VARCHAR(191) NULL,
    `usage_limit` INTEGER NULL,
    `usage_per_user` INTEGER NOT NULL DEFAULT 1,
    `usage_count` INTEGER NOT NULL DEFAULT 0,
    `starts_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vouchers_code_key`(`code`),
    INDEX `vouchers_is_active_expires_at_idx`(`is_active`, `expires_at`),
    INDEX `vouchers_supplier_id_idx`(`supplier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voucher_redemptions` (
    `id` VARCHAR(191) NOT NULL,
    `voucher_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NULL,
    `discount_amount` DECIMAL(15, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `voucher_redemptions_order_id_key`(`order_id`),
    INDEX `voucher_redemptions_voucher_id_user_id_idx`(`voucher_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Saved payments
CREATE TABLE `user_saved_payments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `channel_code` VARCHAR(191) NOT NULL,
    `channel_name` VARCHAR(191) NOT NULL,
    `channel_group` VARCHAR(191) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `last_used_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_saved_payments_user_id_channel_code_key`(`user_id`, `channel_code`),
    INDEX `user_saved_payments_user_id_is_default_idx`(`user_id`, `is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `rfqs` ADD CONSTRAINT `rfqs_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `rfqs` ADD CONSTRAINT `rfqs_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `rfq_responses` ADD CONSTRAINT `rfq_responses_rfq_id_fkey` FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `rfq_responses` ADD CONSTRAINT `rfq_responses_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `rfq_responses` ADD CONSTRAINT `rfq_responses_negotiation_id_fkey` FOREIGN KEY (`negotiation_id`) REFERENCES `negotiations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `voucher_redemptions` ADD CONSTRAINT `voucher_redemptions_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voucher_redemptions` ADD CONSTRAINT `voucher_redemptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voucher_redemptions` ADD CONSTRAINT `voucher_redemptions_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `user_saved_payments` ADD CONSTRAINT `user_saved_payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
