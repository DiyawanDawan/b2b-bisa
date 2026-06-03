-- AlterTable
ALTER TABLE `addresses` ADD COLUMN `phone_number` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `customer_addresses` ADD COLUMN `is_primary` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `product_collections` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `thumbnail_url` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_collections_name_key`(`name`),
    UNIQUE INDEX `product_collections_slug_key`(`slug`),
    INDEX `product_collections_is_active_idx`(`is_active`),
    INDEX `product_collections_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_collection_items` (
    `id` VARCHAR(191) NOT NULL,
    `collection_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    INDEX `product_collection_items_collection_id_idx`(`collection_id`),
    INDEX `product_collection_items_product_id_idx`(`product_id`),
    UNIQUE INDEX `product_collection_items_collection_id_product_id_key`(`collection_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_collection_items` ADD CONSTRAINT `product_collection_items_collection_id_fkey` FOREIGN KEY (`collection_id`) REFERENCES `product_collections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_collection_items` ADD CONSTRAINT `product_collection_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
