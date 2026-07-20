-- Tarif BISA Express: per satuan sesuai UnitStatus produk (KG / TON), bukan hardcode per kg.

ALTER TABLE `bisa_express_rates`
  CHANGE COLUMN `per_kg_cost` `per_unit_cost` DECIMAL(15, 2) NOT NULL;

ALTER TABLE `bisa_express_rates`
  ADD COLUMN `weight_unit` ENUM('KG', 'TON') NOT NULL DEFAULT 'KG'
  AFTER `per_unit_cost`;
