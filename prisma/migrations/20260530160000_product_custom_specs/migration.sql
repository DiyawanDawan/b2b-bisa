-- Dynamic product specifications (key-value pairs beyond fixed columns)

ALTER TABLE `products`
    ADD COLUMN `custom_specs` JSON NULL;
