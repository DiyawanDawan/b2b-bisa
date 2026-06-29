-- Align shipping_pickup_vehicles columns with Prisma schema (drift fix)
ALTER TABLE `shipping_pickup_vehicles`
  CHANGE COLUMN `min_total_weight_kg` `min_total_weight` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  CHANGE COLUMN `max_per_order_weight_kg` `max_per_order_weight` DECIMAL(15, 2) NULL,
  ADD COLUMN `weight_unit` ENUM('KG', 'TON') NOT NULL DEFAULT 'KG' AFTER `max_per_order_weight`;
