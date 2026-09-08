-- Ventas a crédito: pendientes por cobrar y abonos parciales.
-- Idempotente: puede correrse más de una vez sin error ni duplicar datos.
-- Todo es aditivo sobre `orders` y `clients` (tablas compartidas con el
-- workflow de n8n): payment_status nace en 'PAGADA', así que ni las ventas
-- previas ni las órdenes de Telegram cambian de comportamiento.
BEGIN;

-- 1. Teléfono del cliente. Sin esto, "cuánto me debe Juan" no sirve de nada
--    porque no hay por dónde perseguirlo.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone varchar(20);

-- 2. Estado de cobranza. Es un EJE DISTINTO de `status` ('COBRADO'/'CANCELADO'
--    para mostrador, 'PEDIDO_CAPTURADO'/'REMISION_CREADA' para n8n): no se
--    mezclan y no se agregan valores nuevos a `status`.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status varchar(12) NOT NULL DEFAULT 'PAGADA';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_valido') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_status_valido
      CHECK (payment_status IN ('PAGADA','PARCIAL','PENDIENTE'));
  END IF;
END $$;

-- 3. Bitácora de pagos. El cobro inicial TAMBIÉN vive aquí: el corte de caja
--    es "dinero que entró al cajón ese día", y eso solo lo contesta una
--    bitácora fechada, no orders.total_amount.
CREATE TABLE IF NOT EXISTS order_payments (
  id                  serial PRIMARY KEY,
  order_id            int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount              numeric(10,2) NOT NULL CHECK (amount <> 0),  -- negativo = devolución
  payment_method      varchar(20),
  cash_received       numeric(10,2),
  change_given        numeric(10,2),
  note                text,
  idempotency_key     varchar(64),
  reverted_payment_id int REFERENCES order_payments(id),
  created_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pagos_orden ON order_payments (order_id, created_at);
-- El corte: todos los pagos de un día.
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON order_payments (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_idempotency_key
  ON order_payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Mismo blindaje que idx_mov_revertido_una_vez (migración 003): un abono se
-- devuelve una sola vez, aunque alguien intente cancelar la venta dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pago_revertido_una_vez
  ON order_payments (reverted_payment_id) WHERE reverted_payment_id IS NOT NULL;

-- 4. amount_paid / payment_status son caché derivado de la bitácora.
CREATE OR REPLACE FUNCTION recalcular_saldo_orden() RETURNS trigger AS $$
DECLARE
  v_order_id int := coalesce(NEW.order_id, OLD.order_id);
  v_pagado numeric(10,2);
  v_total  numeric(10,2);
BEGIN
  -- Al borrar la orden, el ON DELETE CASCADE dispara esto por cada pago:
  -- ya no hay renglón que actualizar.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = v_order_id) THEN RETURN NULL; END IF;

  SELECT coalesce(sum(amount), 0) INTO v_pagado FROM order_payments WHERE order_id = v_order_id;
  SELECT coalesce(total_amount, 0) INTO v_total  FROM orders WHERE id = v_order_id;

  UPDATE orders
     SET amount_paid = v_pagado,
         payment_status = CASE
           WHEN v_total <= 0   THEN 'PAGADA'     -- venta en ceros: no se debe nada
           WHEN v_pagado <= 0  THEN 'PENDIENTE'
           WHEN v_pagado >= v_total THEN 'PAGADA'
           ELSE 'PARCIAL'
         END
   WHERE id = v_order_id;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_abono_recalcula_saldo ON order_payments;
CREATE TRIGGER trg_abono_recalcula_saldo
  AFTER INSERT OR UPDATE OR DELETE ON order_payments
  FOR EACH ROW EXECUTE FUNCTION recalcular_saldo_orden();

-- 5. Backfill: a las ventas de mostrador ya cobradas se les fabrica su renglón
--    de bitácora con la fecha en que se cobraron, para que el corte de días
--    pasados siga cuadrando. Idempotente por el NOT EXISTS. El trigger deja
--    amount_paid = total_amount y payment_status = 'PAGADA'.
INSERT INTO order_payments (order_id, amount, payment_method, cash_received, change_given, note, created_at)
SELECT o.id, o.total_amount, o.payment_method, o.cash_received, o.change_given,
       'Cobro anterior a la migración 007', o.created_at
FROM orders o
WHERE o.channel = 'mostrador'
  AND o.status <> 'CANCELADO'
  AND o.total_amount > 0
  AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id);

-- 6. Índices del listado de pendientes y del tablero de deudores.
CREATE INDEX IF NOT EXISTS idx_orders_pendientes
  ON orders (created_at)
  WHERE channel = 'mostrador' AND payment_status <> 'PAGADA' AND status <> 'CANCELADO';
CREATE INDEX IF NOT EXISTS idx_orders_pendientes_cliente
  ON orders (client_id)
  WHERE channel = 'mostrador' AND payment_status <> 'PAGADA' AND status <> 'CANCELADO';

COMMIT;
