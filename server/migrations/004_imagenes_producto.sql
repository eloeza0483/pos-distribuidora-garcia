-- Foto del producto, para reconocerlo de un vistazo en el mostrador.
-- Se guarda solo la ruta relativa (p.ej. 'productos/21-1787373251272.jpg');
-- el archivo vive en server/uploads/ y se sirve en /uploads.
-- Idempotente: puede correrse más de una vez sin error.
BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_path varchar(255);

COMMIT;
