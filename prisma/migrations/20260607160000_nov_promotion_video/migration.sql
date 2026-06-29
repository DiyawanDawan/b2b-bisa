-- FB-16 Sponsored listing + FB-17 Product video lite
ALTER TABLE `products`
  ADD COLUMN `is_promoted` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `promoted_until` DATETIME(3) NULL,
  ADD COLUMN `promo_impressions` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `promo_clicks` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `video_url` TEXT NULL;

CREATE INDEX `products_is_promoted_promoted_until_idx` ON `products`(`is_promoted`, `promoted_until`);

-- TransactionType.PROMOTION
ALTER TABLE `transactions` MODIFY `type` ENUM('SALES', 'PAYOUT', 'REFUND', 'PLATFORM_FEE', 'SUBSCRIPTION', 'PROMOTION') NOT NULL DEFAULT 'SALES';
