// Clases Tailwind compartidas entre componentes, equivalentes a las reglas
// que antes vivían en App.css (.btn, .field, .pill, .card, etc).
export const CLASE_BTN =
  'border-none rounded-lg py-[0.55rem] px-4 font-semibold text-[0.9rem] cursor-pointer transition-[filter] duration-150 hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed'

export const CLASE_BTN_PRIMARY = `${CLASE_BTN} bg-primary text-white`
export const CLASE_BTN_ACCENT = `${CLASE_BTN} bg-accent text-[#241404]`
export const CLASE_BTN_GHOST = `${CLASE_BTN} bg-transparent border border-border text-text`
export const CLASE_BTN_DANGER = `${CLASE_BTN} bg-danger-soft text-danger`
export const CLASE_BTN_PELIGRO_SOLIDO = `${CLASE_BTN} bg-danger text-white`

export const CLASE_CARD = 'bg-surface border border-border rounded shadow-sm p-5'
export const CLASE_PAGE_TITLE = 'text-xl font-bold m-0 mb-4 text-primary-dark'
export const CLASE_FIELD = 'flex flex-col gap-[0.3rem] text-[0.85rem] text-text-muted'
export const CLASE_ERROR_BANNER = 'bg-danger-soft text-danger rounded-lg px-[0.9rem] py-[0.6rem] text-[0.88rem] mb-4'
export const CLASE_EMPTY_STATE = 'text-text-muted text-sm py-4'
export const CLASE_AYUDA = 'text-xs text-text-muted mt-1'
export const CLASE_SECCION_TITULO = 'text-xs uppercase tracking-wide text-text-muted font-semibold m-0 mb-[0.7rem]'

export const CLASE_MODAL_FONDO = 'fixed inset-0 bg-[rgba(15,22,40,0.45)] flex items-center justify-center p-4 z-50'
export const CLASE_MODAL = 'bg-surface rounded-xl shadow-md p-6 w-full max-w-[440px]'
export const CLASE_MODAL_TITULO = 'm-0 mb-2 text-[1.15rem] text-primary-dark'
export const CLASE_MODAL_DETALLES = 'm-0 mb-4 bg-bg rounded-lg px-[0.9rem] py-3'
export const CLASE_MODAL_DETALLE = 'flex justify-between gap-4 py-[0.28rem] text-[0.9rem]'
export const CLASE_MODAL_ACCIONES = 'flex justify-end gap-[0.6rem]'

export const CLASE_PILL = 'inline-block px-[0.55rem] py-[0.15rem] rounded-full text-xs font-semibold'
export const CLASE_PILL_ENTRADA = `${CLASE_PILL} bg-success-soft text-success`
export const CLASE_PILL_SALIDA = `${CLASE_PILL} bg-danger-soft text-danger`
export const CLASE_PILL_AJUSTE = `${CLASE_PILL} bg-accent-soft text-[#8a5417]`
export const CLASE_PILL_LOW = `${CLASE_PILL} bg-danger-soft text-danger`

export const CLASE_FOTO = 'w-11 h-11 rounded-lg object-cover bg-bg border border-border block'
export const CLASE_FOTO_VACIA = 'w-11 h-11 rounded-lg bg-bg border border-dashed border-border flex items-center justify-center text-text-muted text-[1.1rem]'

export const CLASE_FILA_TACHADA = '[&>td]:opacity-[0.55] [&>td]:line-through'

export const CLASE_PANEL_TICKET = 'flex flex-col gap-4 items-center'
export const CLASE_PANEL_TICKET_ACCIONES = 'flex gap-[0.6rem]'
