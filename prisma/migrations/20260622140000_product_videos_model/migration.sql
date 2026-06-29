-- FB-17: pisahkan video produk dari kolom products.video_url ke tabel product_videos
CREATE TABLE `product_videos` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `url` TEXT NOT NULL,
    `thumbnail_url` TEXT NULL,
    `title` VARCHAR(191) NULL,
    `duration_sec` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_videos_product_id_key`(`product_id`),
    INDEX `product_videos_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `product_videos` (`id`, `product_id`, `url`, `created_at`, `updated_at`)
SELECT UUID(), `id`, `video_url`, NOW(3), NOW(3)
FROM `products`
WHERE `video_url` IS NOT NULL AND TRIM(`video_url`) <> '';

ALTER TABLE `products` DROP COLUMN `video_url`;

ALTER TABLE `product_videos`
    ADD CONSTRAINT `product_videos_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
