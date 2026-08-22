-- Ticket de venta, cobro con efectivo/cambio y cancelación de ventas.
-- Idempotente: puede correrse más de una vez sin error ni duplicar datos.
BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_received numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_given numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at timestamp;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Para el listado de Ventas y el corte de caja del día: solo mostrador,
-- ordenado por fecha.
CREATE INDEX IF NOT EXISTS idx_orders_mostrador_fecha
  ON orders (created_at DESC) WHERE channel = 'mostrador';

COMMIT;
