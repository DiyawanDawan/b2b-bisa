-- Q1 2027 stretch: FB-19–FB-23

-- FB-19 display currency
ALTER TABLE `users`
  ADD COLUMN `display_currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
  ADD COLUMN `referral_code` VARCHAR(191) NULL,
  ADD COLUMN `referred_by_id` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `users_referral_code_key` ON `users`(`referral_code`);
CREATE INDEX `users_referred_by_id_idx` ON `users`(`referred_by_id`);
ALTER TABLE `users` ADD CONSTRAINT `users_referred_by_id_fkey` FOREIGN KEY (`referred_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- FB-22 e-sign fields
ALTER TABLE `orders`
  MODIFY `is_digital_signed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `buyer_signed_at` DATETIME(3) NULL,
  ADD COLUMN `seller_signed_at` DATETIME(3) NULL,
  ADD COLUMN `buyer_sign_hash` VARCHAR(191) NULL,
  ADD COLUMN `seller_sign_hash` VARCHAR(191) NULL;

CREATE TABLE `referral_rewards` (
  `id` VARCHAR(191) NOT NULL,
  `referrer_id` VARCHAR(191) NOT NULL,
  `referred_user_id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `status` ENUM('PENDING', 'CREDITED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `credited_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `referral_rewards_referred_user_id_key`(`referred_user_id`),
  UNIQUE INDEX `referral_rewards_order_id_key`(`order_id`),
  INDEX `referral_rewards_referrer_id_status_idx`(`referrer_id`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `referral_rewards` ADD CONSTRAINT `referral_rewards_referrer_id_fkey` FOREIGN KEY (`referrer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `referral_rewards` ADD CONSTRAINT `referral_rewards_referred_user_id_fkey` FOREIGN KEY (`referred_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `referral_rewards` ADD CONSTRAINT `referral_rewards_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `supplier_api_keys` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `key_hash` VARCHAR(191) NOT NULL,
  `key_prefix` VARCHAR(191) NOT NULL,
  `last_used_at` DATETIME(3) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `supplier_api_keys_key_hash_key`(`key_hash`),
  INDEX `supplier_api_keys_user_id_is_active_idx`(`user_id`, `is_active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `supplier_api_keys` ADD CONSTRAINT `supplier_api_keys_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `live_sessions` (
  `id` VARCHAR(191) NOT NULL,
  `supplier_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('SCHEDULED', 'LIVE', 'ENDED') NOT NULL DEFAULT 'SCHEDULED',
  `stream_url` TEXT NULL,
  `thumbnail_url` TEXT NULL,
  `pinned_product_ids` JSON NULL,
  `viewer_count` INTEGER NOT NULL DEFAULT 0,
  `scheduled_at` DATETIME(3) NULL,
  `started_at` DATETIME(3) NULL,
  `ended_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `live_sessions_supplier_id_status_idx`(`supplier_id`, `status`),
  INDEX `live_sessions_status_scheduled_at_idx`(`status`, `scheduled_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `live_sessions` ADD CONSTRAINT `live_sessions_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `live_session_comments` (
  `id` VARCHAR(191) NOT NULL,
  `session_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `live_session_comments_session_id_created_at_idx`(`session_id`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `live_session_comments` ADD CONSTRAINT `live_session_comments_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `live_session_comments` ADD CONSTRAINT `live_session_comments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
