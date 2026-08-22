import Fastify from 'fastify'

import dbPlugin from './plugins/db.js'
import corsPlugin from './plugins/cors.js'
import uploadsPlugin from './plugins/uploads.js'

import {
  unitSchema, productSchema, createProductBodySchema, patchProductBodySchema,
  createUnitBodySchema, patchUnitBodySchema
} from './schemas/product.js'
import { movementSchema, createMovementBodySchema } from './schemas/movement.js'
import {
  saleItemInputSchema, createSaleBodySchema, createSaleHeadersSchema, saleResultSchema,
  ticketItemSchema, ticketSchema, saleListItemSchema, saleDetailSchema,
  cashCutPaymentMethodSchema, cashCutSchema, cancelSaleBodySchema
} from './schemas/sale.js'
import { categorySchema, createCategoryBodySchema } from './schemas/category.js'
import { clientSchema } from './schemas/client.js'

import productsRoutes from './routes/products.js'
import scanRoutes from './routes/scan.js'
import unitsRoutes from './routes/units.js'
import inventoryRoutes from './routes/inventory.js'
import salesRoutes from './routes/sales.js'
import categoriesRoutes from './routes/categories.js'
import clientsRoutes from './routes/clients.js'

// buildApp() separado de listen() (en server.js) es lo que permite probar
// con fastify.inject() sin levantar puerto real.
export async function buildApp(opts = {}) {
  const fastify = Fastify({ logger: true, ...opts })

  for (const schema of [
    unitSchema, productSchema, createProductBodySchema, patchProductBodySchema,
    createUnitBodySchema, patchUnitBodySchema,
    movementSchema, createMovementBodySchema,
    saleItemInputSchema, createSaleBodySchema, createSaleHeadersSchema, saleResultSchema,
    ticketItemSchema, ticketSchema, saleListItemSchema, saleDetailSchema,
    cashCutPaymentMethodSchema, cashCutSchema, cancelSaleBodySchema,
    categorySchema, createCategoryBodySchema, clientSchema
  ]) {
    fastify.addSchema(schema)
  }

  await fastify.register(dbPlugin)
  await fastify.register(corsPlugin)
  await fastify.register(uploadsPlugin)

  fastify.get('/health', async () => ({ ok: true }))

  await fastify.register(productsRoutes, { prefix: '/api/products' })
  await fastify.register(scanRoutes, { prefix: '/api/scan' })
  await fastify.register(unitsRoutes, { prefix: '/api/units' })
  await fastify.register(inventoryRoutes, { prefix: '/api/inventory' })
  await fastify.register(salesRoutes, { prefix: '/api/sales' })
  await fastify.register(categoriesRoutes, { prefix: '/api/categories' })
  await fastify.register(clientsRoutes, { prefix: '/api/clients' })

  return fastify
}
