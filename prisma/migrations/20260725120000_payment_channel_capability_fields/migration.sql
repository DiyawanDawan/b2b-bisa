-- Additive: map remaining Xendit payment channel CSV capability columns
ALTER TABLE `payment_channels`
    ADD COLUMN `refund_capability` VARCHAR(191) NULL,
    ADD COLUMN `supports_save` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reusable_payment_code` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `merchant_initiated_transaction` BOOLEAN NOT NULL DEFAULT false;
