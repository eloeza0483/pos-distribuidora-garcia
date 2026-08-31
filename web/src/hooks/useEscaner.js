import { useCallback, useEffect, useRef } from 'react'

// Ventana máxima entre teclas para considerarlas parte del mismo disparo del
// lector. Una pistola teclea el código completo en pocos milisegundos; una
// persona no baja de ~150 ms entre teclas.
export const MS_ENTRE_TECLAS = 60
// Códigos de barras reales tienen 8, 12 o 13 dígitos. Con 4 basta para no
// confundir un atajo suelto con un escaneo.
const LARGO_MINIMO = 4
// Algunos lectores no mandan Enter al final: si la ráfaga se queda quieta,
// se busca igual.
const MS_CIERRE = 120

function enCampoEditable(target) {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable
}

/**
 * Escucha en toda la página las ráfagas de teclas del lector de códigos de
 * barras, sin depender de que un input tenga el foco (en tablet nunca lo
 * tiene: enfocarlo abriría el teclado en pantalla).
 *
 * Escucha en fase de captura sobre `window` para adelantarse a los atajos de
 * Mostrador, DialogoCobro y Confirmacion, que escuchan en burbuja: así las
 * teclas del código nunca se cuelan como atajos.
 *
 * @param {object} opciones
 * @param {(codigo: string) => void} opciones.onCodigo  Se llama con el código leído.
 * @param {boolean} opciones.activo  Si es false, la ráfaga igual se traga (para
 *   que no dispare atajos ajenos) pero no se busca nada.
 * @returns {{ escaneoEnCurso: () => boolean, teclasVistas: () => number }}
 */
export function useEscaner({ onCodigo, activo = true }) {
  const buffer = useRef('')
  const ultimaTecla = useRef(0)
  const ultimoDisparo = useRef(0)
  const contadorTeclas = useRef(0)
  const temporizador = useRef(null)
  const onCodigoRef = useRef(onCodigo)
  const activoRef = useRef(activo)

  useEffect(() => {
    onCodigoRef.current = onCodigo
    activoRef.current = activo
  })

  // True mientras se está acumulando (o se acaba de acumular) un código de
  // barras. Sirve para que los atajos de teclado se hagan a un lado: sus
  // teclas ya no les pertenecen.
  const escaneoEnCurso = useCallback(() => {
    if (buffer.current.length > 1) return true
    return performance.now() - ultimoDisparo.current < MS_CIERRE * 2
  }, [])

  // Contador monótono de teclas vistas. Quien difiera una acción por una tecla
  // puede anotar el valor y volver a consultarlo: si cambió, llegaron más
  // teclas y por lo tanto era una ráfaga del lector, no un dedo. Es más fiable
  // que medir tiempos, porque un temporizador puede retrasarse.
  const teclasVistas = useCallback(() => contadorTeclas.current, [])

  useEffect(() => {
    function limpiar() {
      buffer.current = ''
      if (temporizador.current) {
        clearTimeout(temporizador.current)
        temporizador.current = null
      }
    }

    function disparar() {
      const codigo = buffer.current
      limpiar()
      ultimoDisparo.current = performance.now()
      if (codigo.length >= LARGO_MINIMO && activoRef.current) onCodigoRef.current(codigo)
    }

    function alTecla(e) {
      // Dentro de un campo de texto el hook solo mira: ahí las teclas son del
      // campo (el formulario de código de barras en PC, o alguien escribiendo
      // a mano). Se sigue midiendo la ráfaga para que quien tenga atajos
      // pueda preguntar si esto vino de la pistola.
      const soloObservar = enCampoEditable(e.target)

      if (e.key === 'Enter') {
        if (!soloObservar && buffer.current.length >= LARGO_MINIMO) {
          e.preventDefault()
          e.stopPropagation()
          disparar()
        } else if (buffer.current.length >= LARGO_MINIMO) {
          // Ráfaga tecleada dentro de un campo: no se busca nada (ya lo hace
          // el campo), pero queda constancia para escaneoEnCurso().
          limpiar()
          ultimoDisparo.current = performance.now()
        } else {
          limpiar()
        }
        return
      }

      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
        limpiar()
        return
      }

      const ahora = performance.now()
      contadorTeclas.current += 1
      const continuaRafaga = buffer.current.length > 0 && ahora - ultimaTecla.current < MS_ENTRE_TECLAS
      buffer.current = continuaRafaga ? buffer.current + e.key : e.key
      ultimaTecla.current = ahora

      // Desde la segunda tecla ya se sabe que es una ráfaga: se corta para que
      // no llegue a los atajos 1-9. La primera no se puede distinguir, por eso
      // quien use los atajos debe diferirlos MS_ENTRE_TECLAS.
      if (continuaRafaga && !soloObservar) {
        e.preventDefault()
        e.stopPropagation()
      }

      if (temporizador.current) clearTimeout(temporizador.current)
      temporizador.current = setTimeout(soloObservar ? limpiar : disparar, MS_CIERRE)
    }

    window.addEventListener('keydown', alTecla, true)
    return () => {
      window.removeEventListener('keydown', alTecla, true)
      limpiar()
    }
  }, [])

  return { escaneoEnCurso, teclasVistas }
}
