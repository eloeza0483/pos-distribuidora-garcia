# Instrucciones del proyecto

## Estilos frontend

- Usar Tailwind CSS para todos los estilos del frontend (`web/`), salvo que el usuario indique explícitamente lo contrario.
- Preferir clases utilitarias de Tailwind directamente en el JSX en vez de archivos CSS separados.
- `web/src/index.css` define tokens de color semánticos vía `@theme inline` (bg, surface, border, text, text-muted, primary, primary-dark, primary-soft, accent, accent-soft, danger, danger-soft, success, success-soft) más `radius` y `shadow-sm`/`shadow-md`, con soporte de modo oscuro automático y manual (`[data-theme]`). Usar estos tokens (`bg-primary`, `text-text-muted`, etc.) en vez de colores hardcodeados cuando coincidan.
