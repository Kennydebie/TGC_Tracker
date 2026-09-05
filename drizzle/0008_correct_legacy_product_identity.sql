-- A former demo-derived matcher persisted a quantity in the canonical product
-- name even when a live eBay title did not state that quantity. Keep the real
-- observed listings, but make their shared product identity quantity-neutral.

UPDATE products
SET name = 'Prismatic Evolutions Elite Trainer Box',
    language = 'Unknown',
    manually_verified = 0,
    updated_at = 1788633900000
WHERE id = 'canonical:pe-etb-pair';
