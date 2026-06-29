-- Materialized supply/demand snapshots (async refresh on product/order changes)
CREATE TABLE `market_supply_demand_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'BIOMASSA',
    `biomassa_type` VARCHAR(191) NULL,
    `grade` VARCHAR(191) NULL,
    `product_count` INTEGER NOT NULL DEFAULT 0,
    `listing_count` INTEGER NOT NULL DEFAULT 0,
    `total_stock_kg` INTEGER NOT NULL DEFAULT 0,
    `total_stock_ton` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `province_count` INTEGER NOT NULL DEFAULT 0,
    `order_count_30d` INTEGER NOT NULL DEFAULT 0,
    `order_count_90d` INTEGER NOT NULL DEFAULT 0,
    `open_order_count` INTEGER NOT NULL DEFAULT 0,
    `quantity_kg_30d` INTEGER NOT NULL DEFAULT 0,
    `quantity_kg_90d` INTEGER NOT NULL DEFAULT 0,
    `quantity_ton_90d` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `completed_quantity_kg_90d` INTEGER NOT NULL DEFAULT 0,
    `supply_demand_ratio` DECIMAL(8, 2) NULL,
    `balance` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    `computed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `market_supply_demand_snapshots_label_key`(`label`),
    INDEX `market_supply_demand_snapshots_computed_at_idx`(`computed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
