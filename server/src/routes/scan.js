import { findByBarcode } from '../services/products.js'

// La ruta que dispara el mostrador cada vez que suena la pistola. Se
// mantiene separada de /api/products porque tiene un contrato distinto
// (un código exacto entra, un producto+unidad+precio exacto sale) y debe
// ser la ruta más rápida de todo el backend.
export default async function scanRoutes(fastify) {
  fastify.get('/:barcode', {
    schema: {
      params: {
        type: 'object',
        required: ['barcode'],
        properties: { barcode: { type: 'string', minLength: 1, maxLength: 64 } }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            product_id: { type: 'integer' },
            product_name: { type: 'string' },
            stock_base: { type: 'number' },
            unit_id: { type: 'integer' },
            unit_label: { type: 'string' },
            price: { type: 'number' },
            base_qty: { type: ['number', 'null'] },
            barcode: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    const match = await findByBarcode(fastify, req.params.barcode)
    if (!match) {
      return reply.code(404).send({
        error: 'unknown_barcode',
        message: 'Código no reconocido.',
        barcode: req.params.barcode
      })
    }
    return match
  })
}
