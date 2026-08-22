-- Deshacer un movimiento de inventario mal capturado.
-- La bitácora es inmutable (ver 001_mostrador.sql §6): revertir NO borra el
-- renglón original, inserta uno compensatorio que apunta al que corrige.
-- Idempotente: puede correrse más de una vez sin error.
BEGIN;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS reverted_movement_id int REFERENCES inventory_movements(id);

-- Un movimiento solo puede revertirse una vez: sin esto, dos clics seguidos en
-- "Deshacer" descontarían el doble.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mov_revertido_una_vez
  ON inventory_movements (reverted_movement_id) WHERE reverted_movement_id IS NOT NULL;

COMMIT;
