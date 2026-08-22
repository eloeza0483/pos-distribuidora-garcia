-- Activa el descuento automático de stock por venta.
-- SOLO correr esto cuando los 15 factores de conversión (base_qty) de las
-- unidades de mayoreo ya estén capturados — antes, cualquier venta por
-- bulto/caja descontaría cantidades equivocadas. Ver "Orden de construcción"
-- en el plan.
BEGIN;

DROP TRIGGER IF EXISTS trg_venta_descuenta_stock ON order_items;
CREATE TRIGGER trg_venta_descuenta_stock
  AFTER INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION descontar_stock_por_venta();

COMMIT;
