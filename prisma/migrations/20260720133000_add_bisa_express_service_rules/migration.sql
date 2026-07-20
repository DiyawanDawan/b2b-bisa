-- CreateTable
CREATE TABLE `bisa_express_service_rules` (
    `id` VARCHAR(191) NOT NULL,
    `service_type` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `min_weight_grams` INTEGER NOT NULL DEFAULT 0,
    `max_weight_grams` INTEGER NOT NULL DEFAULT 999999999,
    `always_available` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bisa_express_service_rules_service_type_key`(`service_type`),
    INDEX `bisa_express_service_rules_is_active_sort_order_idx`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
