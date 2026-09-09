// Errores tipados del dominio de ventas y pagos, en un módulo hoja aparte
// para que sales.js y payments.js puedan importarse mutuamente sin ciclo:
// sales.js necesita insertar el pago inicial (de payments.js) y payments.js
// necesita SaleNotFoundError (que antes vivía en sales.js).
export class PriceMismatchError extends Error {
  constructor(details) {
    super('El precio de uno o más productos cambió antes de cobrar.')
    this.name = 'PriceMismatchError'
    this.details = details
  }
}

export class MissingBaseQtyError extends Error {
  constructor(productName, unitLabel) {
    super(`Falta definir cuántas piezas trae "${unitLabel}" de ${productName}.`)
    this.name = 'MissingBaseQtyError'
  }
}

export class ProductNotFoundError extends Error {
  constructor(productId) {
    super(`Producto ${productId} no encontrado.`)
    this.name = 'ProductNotFoundError'
  }
}

export class CashTooLowError extends Error {
  constructor(total, cashReceived) {
    super(`El efectivo recibido (${cashReceived}) no alcanza para cubrir el total (${total}).`)
    this.name = 'CashTooLowError'
  }
}

export class SaleNotFoundError extends Error {
  constructor() {
    super('La venta no existe.')
    this.name = 'SaleNotFoundError'
  }
}

export class SaleAlreadyCancelledError extends Error {
  constructor() {
    super('Esta venta ya está cancelada.')
    this.name = 'SaleAlreadyCancelledError'
  }
}

export class PaymentExceedsBalanceError extends Error {
  constructor(saldo, amount) {
    super(`El abono (${amount}) es mayor que el saldo pendiente (${saldo}).`)
    this.name = 'PaymentExceedsBalanceError'
    this.details = { saldo, amount }
  }
}

export class SaleAlreadyPaidError extends Error {
  constructor() {
    super('Esta venta ya está pagada por completo.')
    this.name = 'SaleAlreadyPaidError'
  }
}

export class SaleCancelledError extends Error {
  constructor() {
    super('No se puede abonar a una venta cancelada.')
    this.name = 'SaleCancelledError'
  }
}

export class CreditRequiresClientError extends Error {
  constructor() {
    super('Una venta pendiente necesita un cliente con nombre; "Público en General" no sirve para cobrarle después.')
    this.name = 'CreditRequiresClientError'
  }
}
