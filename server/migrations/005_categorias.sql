-- Categorías de producto: lista fija que administra el usuario (no texto
-- libre, no detección automática por nombre).
-- Idempotente: puede correrse más de una vez sin error.
BEGIN;

CREATE TABLE IF NOT EXISTS categories (
  id serial PRIMARY KEY,
  name varchar(60) NOT NULL UNIQUE
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id int REFERENCES categories(id);

-- Semilla de arranque a partir de los nombres reales de hoy. Es un punto de
-- partida, no una clasificación definitiva — lo que no matchea ninguna regla
-- se queda sin categoría para que el usuario lo reasigne a mano en vez de
-- que el sistema le invente una categoría incorrecta.
INSERT INTO categories (name) VALUES
  ('Bolsas'), ('Vasos'), ('Platos'), ('Botellas'), ('Papel y empaque')
ON CONFLICT (name) DO NOTHING;

UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Bolsas')
  WHERE category_id IS NULL AND product_name ILIKE 'bolsa%';
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Vasos')
  WHERE category_id IS NULL AND product_name ILIKE 'vaso%';
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Platos')
  WHERE category_id IS NULL AND product_name ILIKE 'plato%';
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Botellas')
  WHERE category_id IS NULL AND product_name ILIKE 'botella%';
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Papel y empaque')
  WHERE category_id IS NULL AND (product_name ILIKE 'papel%' OR product_name ILIKE 'vitafil%');

COMMIT;
