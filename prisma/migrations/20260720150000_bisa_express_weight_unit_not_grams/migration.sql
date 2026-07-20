-- BISA Express: berat pakai UnitStatus (KG/TON), bukan gram.

-- ── rates ──────────────────────────────────────────────
ALTER TABLE `bisa_express_rates`
  ADD COLUMN `min_weight` DECIMAL(15, 3) NOT NULL DEFAULT 0 AFTER `service_type`,
  ADD COLUMN `max_weight` DECIMAL(15, 3) NOT NULL DEFAULT 999999999 AFTER `min_weight`;

-- Data lama (gram) → KG
UPDATE `bisa_express_rates`
SET
  `min_weight` = `min_weight_grams` / 1000,
  `max_weight` = CASE
    WHEN `max_weight_grams` >= 999999999 THEN 999999999
    ELSE `max_weight_grams` / 1000
  END;

ALTER TABLE `bisa_express_rates` DROP INDEX `bisa_express_rates_zone_svc_min_w_key`;

ALTER TABLE `bisa_express_rates`
  DROP COLUMN `min_weight_grams`,
  DROP COLUMN `max_weight_grams`;

CREATE UNIQUE INDEX `bisa_express_rates_zone_svc_min_u_key`
  ON `bisa_express_rates`(`origin_zone`, `destination_zone`, `service_type`, `min_weight`, `weight_unit`);

-- ── service rules ──────────────────────────────────────
ALTER TABLE `bisa_express_service_rules`
  ADD COLUMN `min_weight` DECIMAL(15, 3) NOT NULL DEFAULT 0 AFTER `label`,
  ADD COLUMN `max_weight` DECIMAL(15, 3) NOT NULL DEFAULT 999999999 AFTER `min_weight`,
  ADD COLUMN `weight_unit` ENUM('KG', 'TON') NOT NULL DEFAULT 'KG' AFTER `max_weight`;

UPDATE `bisa_express_service_rules`
SET
  `min_weight` = `min_weight_grams` / 1000,
  `max_weight` = CASE
    WHEN `max_weight_grams` >= 999999999 THEN 999999999
    ELSE `max_weight_grams` / 1000
  END;

ALTER TABLE `bisa_express_service_rules`
  DROP COLUMN `min_weight_grams`,
  DROP COLUMN `max_weight_grams`;

-- ── shipments ──────────────────────────────────────────
ALTER TABLE `bisa_express_shipments`
  ADD COLUMN `weight` DECIMAL(15, 3) NOT NULL DEFAULT 0 AFTER `delivered_at`,
  ADD COLUMN `weight_unit` ENUM('KG', 'TON') NOT NULL DEFAULT 'KG' AFTER `weight`;

UPDATE `bisa_express_shipments`
SET `weight` = `weight_grams` / 1000, `weight_unit` = 'KG';

ALTER TABLE `bisa_express_shipments` DROP COLUMN `weight_grams`;
