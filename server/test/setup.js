// Las pruebas escriben en la base (crean productos, mueven inventario, cobran),
// así que NUNCA deben correr contra la base real. Se carga .env.test a la
// fuerza y se aborta si apunta a cualquier otra cosa.
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test', override: true })

if (!process.env.DATABASE_URL?.endsWith('_test')) {
  throw new Error(
    `Las pruebas solo corren contra una base terminada en "_test". ` +
    `DATABASE_URL actual: ${process.env.DATABASE_URL ?? '(sin definir)'}. ` +
    `Crea .env.test apuntando a distribuidora_garcia_test.`
  )
}
