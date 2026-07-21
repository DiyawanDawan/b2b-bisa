ALTER TABLE `notifications`
  MODIFY COLUMN `type` ENUM(
    'ORDER_STATUS',
    'PAYMENT_RECEIVED',
    'IOT_ALERT',
    'SYSTEM_ANNOUNCEMENT',
    'PRODUCT_CERTIFICATE',
    'DISPUTE',
    'RFQ',
    'PARTNERSHIP',
    'BOOKING',
    'SUPPORT'
  ) NOT NULL;

CREATE TABLE `product_certificates` (
  `id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `certificate_type` VARCHAR(191) NOT NULL,
  `issuer_name` VARCHAR(191) NULL,
  `certificate_number` VARCHAR(191) NULL,
  `issued_at` DATETIME(3) NULL,
  `expires_at` DATETIME(3) NULL,
  `storage_key` TEXT NOT NULL,
  `file_name` VARCHAR(191) NOT NULL,
  `mime_type` VARCHAR(191) NOT NULL,
  `file_size_bytes` BIGINT NOT NULL,
  `sha256` VARCHAR(191) NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by_id` VARCHAR(191) NULL,
  `reviewed_at` DATETIME(3) NULL,
  `rejection_reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `product_certificates_product_id_status_idx` (`product_id`, `status`),
  INDEX `product_certificates_status_created_at_idx` (`status`, `created_at`),
  INDEX `product_certificates_reviewed_by_id_idx` (`reviewed_by_id`),
  CONSTRAINT `product_certificates_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_certificates_reviewed_by_id_fkey`
    FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
