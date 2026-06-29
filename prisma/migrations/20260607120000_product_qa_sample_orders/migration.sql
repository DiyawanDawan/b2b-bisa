-- FB-4 Product Q&A + FB-8 Sample orders (Jul 2026)

-- OrderType enum + column on orders
ALTER TABLE `orders` ADD COLUMN `order_type` ENUM('STANDARD', 'SAMPLE') NOT NULL DEFAULT 'STANDARD';
CREATE INDEX `orders_order_type_idx` ON `orders`(`order_type`);

-- Sample fields on products
ALTER TABLE `products` ADD COLUMN `allows_sample` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `products` ADD COLUMN `sample_max_qty` DECIMAL(15, 2) NOT NULL DEFAULT 1;
ALTER TABLE `products` ADD COLUMN `sample_price_per_unit` DECIMAL(15, 2) NULL;

-- Product questions (FB-4)
CREATE TABLE `product_questions` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `asker_id` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NULL,
    `answered_at` DATETIME(3) NULL,
    `answered_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `product_questions_product_id_created_at_idx`(`product_id`, `created_at`),
    INDEX `product_questions_asker_id_idx`(`asker_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `product_questions` ADD CONSTRAINT `product_questions_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_questions` ADD CONSTRAINT `product_questions_asker_id_fkey` FOREIGN KEY (`asker_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `product_questions` ADD CONSTRAINT `product_questions_answered_by_id_fkey` FOREIGN KEY (`answered_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
