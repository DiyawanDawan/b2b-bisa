-- AlterTable
ALTER TABLE `chat_messages` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `order_shipping` MODIFY `courier_code` VARCHAR(191) NOT NULL,
    MODIFY `courier_name` VARCHAR(191) NULL,
    MODIFY `service_code` VARCHAR(191) NULL,
    MODIFY `service_name` VARCHAR(191) NOT NULL,
    MODIFY `etd` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `shipment_tracking` MODIFY `awb_number` VARCHAR(191) NULL,
    MODIFY `courier_code` VARCHAR(191) NULL,
    MODIFY `recipient_phone_last5` VARCHAR(191) NULL,
    MODIFY `delivery_status` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `shipping_pickup_vehicles` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `min_total_weight_kg` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `max_per_order_weight_kg` DECIMAL(15, 2) NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shipping_pickup_vehicles_code_key`(`code`),
    INDEX `shipping_pickup_vehicles_is_active_sort_order_idx`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipping_pickup_vehicle_units` (
    `id` VARCHAR(191) NOT NULL,
    `vehicle_id` VARCHAR(191) NOT NULL,
    `unit` ENUM('KG', 'TON') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shipping_pickup_vehicle_units_unit_idx`(`unit`),
    UNIQUE INDEX `shipping_pickup_vehicle_units_vehicle_id_unit_key`(`vehicle_id`, `unit`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipping_couriers` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shipping_couriers_code_key`(`code`),
    INDEX `shipping_couriers_is_active_sort_order_idx`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shipping_pickup_vehicle_units` ADD CONSTRAINT `shipping_pickup_vehicle_units_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `shipping_pickup_vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
