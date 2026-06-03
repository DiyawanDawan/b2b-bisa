-- RajaOngkir: simpan ongkir per order + resi + profil asal/tujuan

ALTER TABLE `shipment_tracking`
  ADD COLUMN `awb_number` VARCHAR(64) NULL,
  ADD COLUMN `courier_code` VARCHAR(32) NULL,
  ADD COLUMN `recipient_phone_last5` VARCHAR(5) NULL,
  ADD COLUMN `delivery_status` VARCHAR(64) NULL,
  ADD COLUMN `tracking_snapshot` JSON NULL,
  ADD COLUMN `last_tracked_at` DATETIME(3) NULL;

CREATE INDEX `shipment_tracking_awb_number_idx` ON `shipment_tracking`(`awb_number`);
CREATE INDEX `shipment_tracking_courier_code_idx` ON `shipment_tracking`(`courier_code`);

CREATE TABLE `order_shipping` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `origin_destination_id` INTEGER NOT NULL,
  `destination_destination_id` INTEGER NOT NULL,
  `origin_label` TEXT NULL,
  `destination_label` TEXT NULL,
  `weight_grams` INTEGER NOT NULL,
  `courier_code` VARCHAR(32) NOT NULL,
  `courier_name` VARCHAR(128) NULL,
  `service_code` VARCHAR(64) NULL,
  `service_name` VARCHAR(128) NOT NULL,
  `service_description` TEXT NULL,
  `shipping_cost` DECIMAL(15, 2) NOT NULL,
  `etd` VARCHAR(64) NULL,
  `verified_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `order_shipping_order_id_key`(`order_id`),
  INDEX `order_shipping_courier_code_idx`(`courier_code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `order_shipping`
  ADD CONSTRAINT `order_shipping_order_id_fkey`
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_profiles`
  ADD COLUMN `rajaongkir_origin_id` INTEGER NULL,
  ADD COLUMN `rajaongkir_origin_label` TEXT NULL;

ALTER TABLE `customer_addresses`
  ADD COLUMN `rajaongkir_destination_id` INTEGER NULL,
  ADD COLUMN `rajaongkir_destination_label` TEXT NULL;
