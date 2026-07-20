-- BISA Express tables
-- CreateTable
CREATE TABLE `bisa_express_drivers` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `employee_code` VARCHAR(191) NOT NULL,
    `status` ENUM('AVAILABLE', 'ON_PICKUP', 'ON_DELIVERY', 'RETURNING', 'OFF_DUTY', 'SUSPENDED') NOT NULL DEFAULT 'AVAILABLE',
    `vehicleType` ENUM('MOTORCYCLE', 'VAN', 'PICKUP_TRUCK', 'TRUCK_CDD', 'TRUCK_FUSO', 'TRUCK_TRONTON') NOT NULL DEFAULT 'PICKUP_TRUCK',
    `vehicle_plate` VARCHAR(191) NULL,
    `max_capacity_kg` DECIMAL(10, 2) NOT NULL DEFAULT 1000,
    `home_hub_id` VARCHAR(191) NULL,
    `current_lat` DECIMAL(10, 8) NULL,
    `current_lng` DECIMAL(11, 8) NULL,
    `last_location_at` DATETIME(3) NULL,
    `total_deliveries` INTEGER NOT NULL DEFAULT 0,
    `total_pickups` INTEGER NOT NULL DEFAULT 0,
    `avg_rating` DECIMAL(3, 2) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bisa_express_drivers_user_id_key`(`user_id`),
    UNIQUE INDEX `bisa_express_drivers_employee_code_key`(`employee_code`),
    INDEX `bisa_express_drivers_status_idx`(`status`),
    INDEX `bisa_express_drivers_home_hub_id_idx`(`home_hub_id`),
    INDEX `bisa_express_drivers_is_active_status_idx`(`is_active`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_location_logs` (
    `id` VARCHAR(191) NOT NULL,
    `driver_id` VARCHAR(191) NOT NULL,
    `latitude` DECIMAL(10, 8) NOT NULL,
    `longitude` DECIMAL(11, 8) NOT NULL,
    `speed` DECIMAL(6, 2) NULL,
    `heading` DECIMAL(5, 2) NULL,
    `accuracy` DECIMAL(8, 2) NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `driver_location_logs_driver_id_captured_at_idx`(`driver_id`, `captured_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bisa_express_hubs` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('MAIN_HUB', 'SUB_HUB', 'DROP_POINT') NOT NULL DEFAULT 'MAIN_HUB',
    `address_id` VARCHAR(191) NOT NULL,
    `coverage_provinces` JSON NULL,
    `coverage_regencies` JSON NULL,
    `contact_phone` VARCHAR(191) NULL,
    `contact_name` VARCHAR(191) NULL,
    `operating_hours` VARCHAR(191) NULL,
    `max_daily_capacity` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bisa_express_hubs_code_key`(`code`),
    INDEX `bisa_express_hubs_type_is_active_idx`(`type`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bisa_express_shipments` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `awb_number` VARCHAR(191) NOT NULL,
    `status` ENUM('AWAITING_PICKUP', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT_TO_HUB', 'AT_ORIGIN_HUB', 'IN_TRANSIT', 'AT_DESTINATION_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED', 'CANCELLED') NOT NULL DEFAULT 'AWAITING_PICKUP',
    `origin_hub_id` VARCHAR(191) NULL,
    `destination_hub_id` VARCHAR(191) NULL,
    `pickup_address` TEXT NOT NULL,
    `pickup_contact` VARCHAR(191) NOT NULL,
    `pickup_phone` VARCHAR(191) NOT NULL,
    `pickup_lat` DECIMAL(10, 8) NULL,
    `pickup_lng` DECIMAL(11, 8) NULL,
    `pickup_driver_id` VARCHAR(191) NULL,
    `pickup_scheduled_at` DATETIME(3) NULL,
    `picked_up_at` DATETIME(3) NULL,
    `delivery_address` TEXT NOT NULL,
    `delivery_contact` VARCHAR(191) NOT NULL,
    `delivery_phone` VARCHAR(191) NOT NULL,
    `delivery_lat` DECIMAL(10, 8) NULL,
    `delivery_lng` DECIMAL(11, 8) NULL,
    `delivery_driver_id` VARCHAR(191) NULL,
    `delivered_at` DATETIME(3) NULL,
    `weight_grams` INTEGER NOT NULL,
    `length_cm` INTEGER NULL,
    `width_cm` INTEGER NULL,
    `height_cm` INTEGER NULL,
    `item_description` TEXT NULL,
    `package_count` INTEGER NOT NULL DEFAULT 1,
    `shipping_cost` DECIMAL(15, 2) NOT NULL,
    `insurance_cost` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `cod_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `service_type` VARCHAR(191) NOT NULL,
    `etd_days` INTEGER NULL,
    `pod_photo_url` TEXT NULL,
    `pod_signature_url` TEXT NULL,
    `pod_received_by` VARCHAR(191) NULL,
    `pod_note` TEXT NULL,
    `seller_note` TEXT NULL,
    `driver_note` TEXT NULL,
    `fail_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bisa_express_shipments_order_id_key`(`order_id`),
    UNIQUE INDEX `bisa_express_shipments_awb_number_key`(`awb_number`),
    INDEX `bisa_express_shipments_status_idx`(`status`),
    INDEX `bisa_express_shipments_awb_number_idx`(`awb_number`),
    INDEX `bisa_express_shipments_pickup_driver_id_idx`(`pickup_driver_id`),
    INDEX `bisa_express_shipments_delivery_driver_id_idx`(`delivery_driver_id`),
    INDEX `bisa_express_shipments_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipment_status_logs` (
    `id` VARCHAR(191) NOT NULL,
    `shipment_id` VARCHAR(191) NOT NULL,
    `status` ENUM('AWAITING_PICKUP', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT_TO_HUB', 'AT_ORIGIN_HUB', 'IN_TRANSIT', 'AT_DESTINATION_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED', 'CANCELLED') NOT NULL,
    `description` TEXT NOT NULL,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `location` VARCHAR(191) NULL,
    `actor_id` VARCHAR(191) NULL,
    `actor_type` VARCHAR(191) NULL,
    `photo_url` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shipment_status_logs_shipment_id_created_at_idx`(`shipment_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipment_hub_logs` (
    `id` VARCHAR(191) NOT NULL,
    `shipment_id` VARCHAR(191) NOT NULL,
    `hub_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `scanned_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shipment_hub_logs_shipment_id_idx`(`shipment_id`),
    INDEX `shipment_hub_logs_hub_id_created_at_idx`(`hub_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `shipment_id` VARCHAR(191) NOT NULL,
    `driver_id` VARCHAR(191) NOT NULL,
    `attempt_number` INTEGER NOT NULL,
    `result` ENUM('SUCCESS', 'NOBODY_HOME', 'WRONG_ADDRESS', 'REFUSED', 'DAMAGED', 'OTHER') NOT NULL,
    `note` TEXT NULL,
    `photo_url` TEXT NULL,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `attempted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `delivery_attempts_shipment_id_idx`(`shipment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bisa_express_rates` (
    `id` VARCHAR(191) NOT NULL,
    `origin_zone` VARCHAR(191) NOT NULL,
    `destination_zone` VARCHAR(191) NOT NULL,
    `service_type` VARCHAR(191) NOT NULL,
    `min_weight_grams` INTEGER NOT NULL DEFAULT 0,
    `max_weight_grams` INTEGER NOT NULL DEFAULT 999999999,
    `base_cost` DECIMAL(15, 2) NOT NULL,
    `per_kg_cost` DECIMAL(15, 2) NOT NULL,
    `etd_days` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `bisa_express_rates_origin_destination_idx`(`origin_zone`, `destination_zone`),
    UNIQUE INDEX `bisa_express_rates_zone_svc_min_w_key`(`origin_zone`, `destination_zone`, `service_type`, `min_weight_grams`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bisa_express_coverage` (
    `id` VARCHAR(191) NOT NULL,
    `province_id` VARCHAR(191) NOT NULL,
    `regency_id` VARCHAR(191) NULL,
    `zone` VARCHAR(191) NOT NULL,
    `is_pickup` BOOLEAN NOT NULL DEFAULT true,
    `is_delivery` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `bisa_express_coverage_zone_idx`(`zone`),
    UNIQUE INDEX `bisa_express_coverage_province_id_regency_id_key`(`province_id`, `regency_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bisa_express_drivers` ADD CONSTRAINT `bisa_express_drivers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bisa_express_drivers` ADD CONSTRAINT `bisa_express_drivers_home_hub_id_fkey` FOREIGN KEY (`home_hub_id`) REFERENCES `bisa_express_hubs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `driver_location_logs` ADD CONSTRAINT `driver_location_logs_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `bisa_express_drivers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bisa_express_hubs` ADD CONSTRAINT `bisa_express_hubs_address_id_fkey` FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `bisa_express_shipments` ADD CONSTRAINT `bisa_express_shipments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bisa_express_shipments` ADD CONSTRAINT `bisa_express_shipments_origin_hub_id_fkey` FOREIGN KEY (`origin_hub_id`) REFERENCES `bisa_express_hubs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `bisa_express_shipments` ADD CONSTRAINT `bisa_express_shipments_destination_hub_id_fkey` FOREIGN KEY (`destination_hub_id`) REFERENCES `bisa_express_hubs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `bisa_express_shipments` ADD CONSTRAINT `bisa_express_shipments_pickup_driver_id_fkey` FOREIGN KEY (`pickup_driver_id`) REFERENCES `bisa_express_drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `bisa_express_shipments` ADD CONSTRAINT `bisa_express_shipments_delivery_driver_id_fkey` FOREIGN KEY (`delivery_driver_id`) REFERENCES `bisa_express_drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `shipment_status_logs` ADD CONSTRAINT `shipment_status_logs_shipment_id_fkey` FOREIGN KEY (`shipment_id`) REFERENCES `bisa_express_shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `shipment_hub_logs` ADD CONSTRAINT `shipment_hub_logs_shipment_id_fkey` FOREIGN KEY (`shipment_id`) REFERENCES `bisa_express_shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `shipment_hub_logs` ADD CONSTRAINT `shipment_hub_logs_hub_id_fkey` FOREIGN KEY (`hub_id`) REFERENCES `bisa_express_hubs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `delivery_attempts` ADD CONSTRAINT `delivery_attempts_shipment_id_fkey` FOREIGN KEY (`shipment_id`) REFERENCES `bisa_express_shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `delivery_attempts` ADD CONSTRAINT `delivery_attempts_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `bisa_express_drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
