import Fastify from 'fastify'

import dbPlugin from './plugins/db.js'
import corsPlugin from './plugins/cors.js'

import {
  unitSchema, productSchema, createProductBodySchema, patchProductBodySchema,
  createUnitBodySchema, patchUnitBodySchema
} from './schemas/product.js'
import { movementSchema, createMovementBodySchema } from './schemas/movement.js'
import {
  saleItemInputSchema, createSaleBodySchema, createSaleHeadersSchema, saleResultSchema
} from './schemas/sale.js'

import productsRoutes from './routes/products.js'
import scanRoutes from './routes/scan.js'
import unitsRoutes from './routes/units.js'
import inventoryRoutes from './routes/inventory.js'
import salesRoutes from './routes/sales.js'

// buildApp() separado de listen() (en server.js) es lo que permite probar
// con fastify.inject() sin levantar puerto real.
export async function buildApp(opts = {}) {
  const fastify = Fastify({ logger: true, ...opts })

  for (const schema of [
    unitSchema, productSchema, createProductBodySchema, patchProductBodySchema,
    createUnitBodySchema, patchUnitBodySchema,
    movementSchema, createMovementBodySchema,
    saleItemInputSchema, createSaleBodySchema, createSaleHeadersSchema, saleResultSchema
  ]) {
    fastify.addSchema(schema)
  }

  await fastify.register(dbPlugin)
  await fastify.register(corsPlugin)

  fastify.get('/health', async () => ({ ok: true }))

  await fastify.register(productsRoutes, { prefix: '/api/products' })
  await fastify.register(scanRoutes, { prefix: '/api/scan' })
  await fastify.register(unitsRoutes, { prefix: '/api/units' })
  await fastify.register(inventoryRoutes, { prefix: '/api/inventory' })
  await fastify.register(salesRoutes, { prefix: '/api/sales' })

  return fastify
}
