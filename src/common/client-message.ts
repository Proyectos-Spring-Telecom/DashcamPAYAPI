const DRIVER_TEXT =
  /queryfailed|sql syntax|unknown column|duplicate entry|ER_[A-Z0-9_]+|econnreset|econnrefused|sqlstate|deadlock|cannot add or update a child row|\/src\/.*\.(?:ts|js):\d+/i;

/** Texto que sí puede salir al cliente. El del driver o un stack no. */
export function safeClientMessage(message: unknown, status: number): string {
  const text = Array.isArray(message)
    ? message.map((item) => String(item)).join(', ')
    : String(message ?? '');
  const fallback =
    status >= 500 ? 'Error interno del servidor' : 'Solicitud no válida';
  if (
    !text ||
    text === '[object Object]' ||
    text === 'undefined' ||
    DRIVER_TEXT.test(text)
  ) {
    return fallback;
  }
  return text.length > 500 ? text.slice(0, 500) : text;
}
