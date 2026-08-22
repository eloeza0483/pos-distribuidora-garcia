-- Mostrador e inventario — Distribuidora García
-- Idempotente: puede correrse más de una vez sin error ni duplicar datos.
BEGIN;

-- 1. Factor de conversión a unidad base. La unidad por omisión es la base = 1.
--    Las demás quedan NULL hasta que se capturen desde la app (ver vista
--    "Captura de factores" en el plan) — NULL es la señal de "falta capturar".
ALTER TABLE product_units ADD COLUMN IF NOT EXISTS base_qty numeric(12,3);
UPDATE product_units SET base_qty = 1 WHERE is_default = true AND base_qty IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_units_base_qty_pos'
  ) THEN
    ALTER TABLE product_units ADD CONSTRAINT product_units_base_qty_pos
      CHECK (base_qty IS NULL OR base_qty > 0);
  END IF;
END $$;

-- 2. Código de barras por unidad vendible (la caja trae EAN distinto al de la pieza).
--    Índice parcial: permite muchos NULL, pero ningún código repetido.
ALTER TABLE product_units ADD COLUMN IF NOT EXISTS barcode varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_barcode
  ON product_units (barcode) WHERE barcode IS NOT NULL;

-- 3. Existencias en unidad base
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_base numeric(12,3) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_base numeric(12,3);

-- 4. Búsqueda rápida por nombre y alias (la que ya usa n8n, ahora indexada).
--    unaccent() no es IMMUTABLE (depende del diccionario activo), así que no se
--    puede usar directo en un índice: se envuelve en una función propia que sí
--    lo es, con un diccionario fijo — el mismo truco que usa n8n en sus queries.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS $$
  SELECT unaccent('unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

CREATE INDEX IF NOT EXISTS idx_products_busqueda
  ON products USING gin ((immutable_unaccent(lower(product_name)) || ' ' || immutable_unaccent(lower(coalesce(aliases,'')))) gin_trgm_ops);

-- 5. Cobro en mostrador
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method varchar(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel varchar(20) NOT NULL DEFAULT 'telegram';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 6. Libro de movimientos (bitácora inmutable)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id            serial PRIMARY KEY,
  product_id    int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type          varchar(10) NOT NULL CHECK (type IN ('entrada','salida','ajuste')),
  quantity      numeric(12,3) NOT NULL,   -- cantidad tal como se capturó
  unit_label    varchar(30),              -- unidad en que se capturó
  base_qty      numeric(12,3) NOT NULL,   -- factor aplicado (congelado)
  quantity_base numeric(12,3) NOT NULL,   -- con signo: salida es negativo
  stock_after   numeric(12,3) NOT NULL,   -- saldo resultante, para auditar
  reason        text,
  order_id      int REFERENCES orders(id) ON DELETE SET NULL,
  created_at    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mov_producto_fecha
  ON inventory_movements (product_id, created_at DESC);

-- 7. list_price siempre espeja el precio de la unidad por omisión (blinda a n8n:
--    products.list_price es el fallback de cotización que usan varios nodos del
--    workflow de Telegram, y no debe desincronizarse del precio de venta real).
CREATE OR REPLACE FUNCTION sync_list_price() RETURNS trigger AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE products SET list_price = NEW.price WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_list_price ON product_units;
CREATE TRIGGER trg_sync_list_price
  AFTER INSERT OR UPDATE OF price, is_default ON product_units
  FOR EACH ROW EXECUTE FUNCTION sync_list_price();

-- 8. Cliente de mostrador para ventas sin cliente fiscal
INSERT INTO clients (client_name, rfc) VALUES ('Público en General', 'XAXX010101000')
ON CONFLICT (client_name) DO NOTHING;

-- 9. Función que descuenta stock al insertar un renglón de venta (order_items).
--    Se crea aquí pero el trigger que la activa vive en 002_activar_descuento_ventas.sql,
--    aplicado solo cuando los 15 factores de conversión ya estén capturados
--    (ver "Orden de construcción" en el plan) — activarla antes descontaría
--    cantidades equivocadas para los productos que se venden por bulto/caja.
CREATE OR REPLACE FUNCTION descontar_stock_por_venta() RETURNS trigger AS $$
DECLARE
  v_base_qty numeric(12,3);
  v_quantity_base numeric(12,3);
  v_stock_after numeric(12,3);
BEGIN
  -- Producto no resuelto (n8n a veces guarda solo product_raw_name): no hay
  -- inventario que descontar, se ignora sin fallar la venta.
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bloquea el renglón del producto para que dos ventas simultáneas no se pisen.
  PERFORM 1 FROM products WHERE id = NEW.product_id FOR UPDATE;

  -- Resuelve el factor de conversión de la unidad vendida. Si no vino unit_label
  -- (o no coincide con ninguna unidad), usa la unidad por omisión del producto.
  SELECT base_qty INTO v_base_qty
  FROM product_units
  WHERE product_id = NEW.product_id
    AND (
      (NEW.unit_label IS NOT NULL AND lower(unit_label) = lower(NEW.unit_label))
      OR (NEW.unit_label IS NULL AND is_default)
    )
  ORDER BY is_default DESC
  LIMIT 1;

  IF v_base_qty IS NULL THEN
    -- Unidad sin factor capturado todavía: no se puede saber cuánto descontar.
    -- No se bloquea la venta (ya se cobró), pero tampoco se inventa un número.
    RETURN NEW;
  END IF;

  v_quantity_base := NEW.quantity * v_base_qty * -1;

  UPDATE products
  SET stock_base = stock_base + v_quantity_base
  WHERE id = NEW.product_id
  RETURNING stock_base INTO v_stock_after;

  INSERT INTO inventory_movements
    (product_id, type, quantity, unit_label, base_qty, quantity_base, stock_after, reason, order_id)
  VALUES
    (NEW.product_id, 'salida', NEW.quantity, NEW.unit_label, v_base_qty, v_quantity_base, v_stock_after,
     'Venta', NEW.order_id);

  RETURN NEW;
END $$ LANGUAGE plpgsql;

COMMIT;
