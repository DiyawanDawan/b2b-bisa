-- order_shipping: berat pakai UnitStatus (KG/TON), hapus gram.

ALTER TABLE `order_shipping`
  ADD COLUMN `weight` DECIMAL(15, 3) NOT NULL DEFAULT 0 AFTER `destination_label`,
  ADD COLUMN `weight_unit` ENUM('KG', 'TON') NOT NULL DEFAULT 'KG' AFTER `weight`;

UPDATE `order_shipping`
SET `weight` = `weight_grams` / 1000, `weight_unit` = 'KG';

ALTER TABLE `order_shipping` DROP COLUMN `weight_grams`;
