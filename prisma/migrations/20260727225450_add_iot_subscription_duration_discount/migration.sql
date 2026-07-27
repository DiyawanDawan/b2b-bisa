-- CreateTable: IotSubscriptionPlan
-- (Already applied via db push — this migration documents it in migration history)
CREATE TABLE IF NOT EXISTS `iot_subscription_plans` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `monthly_rate` INTEGER NOT NULL DEFAULT 0,
    `hardware_price` INTEGER NOT NULL DEFAULT 0,
    `unit` VARCHAR(191) NOT NULL DEFAULT '',
    `tag` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `icon` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `features_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `iot_subscription_plans_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: IotSubscriptionDuration (with discount type/value support)
CREATE TABLE IF NOT EXISTS `iot_subscription_durations` (
    `id` VARCHAR(191) NOT NULL,
    `months` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `discount_type` ENUM('PERCENTAGE', 'FIXED') NOT NULL DEFAULT 'PERCENTAGE',
    `discount_value` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discount_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0,
    `discount_label` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `iot_subscription_durations_months_key`(`months`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable (already applied via db push)
ALTER TABLE `users` ADD INDEX IF NOT EXISTS `users_referral_code_idx` (`referral_code`);

-- AlterTable store_banners default
ALTER TABLE `store_banners` MODIFY COLUMN `moderation_status` ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING';
