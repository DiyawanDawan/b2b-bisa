-- Backfill checkout_batch_number untuk pesanan multi-supplier yang sudah ada.
-- Format baru: ORD-BISA-MCHK-YYYYMMDD-... (MCHK = Multi-Checkout BISA)
-- Format lama tetap valid di app (ORD-BATCH-...)

UPDATE orders o
JOIN (
  SELECT
    checkout_batch_id,
    CONCAT(
      'ORD-BATCH-',
      DATE_FORMAT(MIN(created_at), '%Y%m%d'),
      '-',
      UPPER(SUBSTRING(REPLACE(MIN(id), '-', ''), 1, 8))
    ) AS batch_number
  FROM orders
  WHERE checkout_batch_id IS NOT NULL
  GROUP BY checkout_batch_id
  HAVING COUNT(*) > 1
) b ON o.checkout_batch_id = b.checkout_batch_id
SET o.checkout_batch_number = b.batch_number
WHERE o.checkout_batch_number IS NULL;

UPDATE orders
SET checkout_batch_number = orderNumber
WHERE checkout_batch_number IS NULL;

-- Perbaiki status sibling yang masih PENDING padahal batch sudah dibayar (lead PROCESSING).
UPDATE orders sibling
INNER JOIN orders paid ON paid.checkout_batch_id = sibling.checkout_batch_id
  AND paid.status = 'PROCESSING'
SET sibling.status = 'PROCESSING'
WHERE sibling.checkout_batch_id IS NOT NULL
  AND sibling.status = 'PENDING'
  AND sibling.id <> paid.id;
