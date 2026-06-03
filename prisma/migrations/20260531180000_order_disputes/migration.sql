-- CreateTable
CREATE TABLE `order_disputes` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `raised_by_id` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `description` TEXT NULL,
    `evidence_urls` JSON NOT NULL,
    `seller_response` TEXT NULL,
    `seller_evidence_urls` JSON NOT NULL,
    `seller_responded_at` DATETIME(3) NULL,
    `status` ENUM('OPEN', 'UNDER_REVIEW', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `resolution` VARCHAR(191) NULL,
    `resolution_note` TEXT NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolved_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `order_disputes_order_id_key`(`order_id`),
    INDEX `order_disputes_status_idx`(`status`),
    INDEX `order_disputes_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_disputes` ADD CONSTRAINT `order_disputes_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_disputes` ADD CONSTRAINT `order_disputes_raised_by_id_fkey` FOREIGN KEY (`raised_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
