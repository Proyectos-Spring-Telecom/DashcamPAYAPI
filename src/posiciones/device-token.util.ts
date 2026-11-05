import { createHash, timingSafeEqual } from 'crypto';

/**
 * Credencial de dispositivo (H-58 / V2-08).
 *
 * El dispositivo (validador / contador) envía un token en texto plano por el
 * header `x-device-token`. En la base sólo se guarda su hash SHA-256 en
 * `DeviceTokenHash` (VARCHAR(64), hex). La comparación es en tiempo constante
 * para no filtrar información por temporización.
 *
 * El PROVISIONAMIENTO del token (generar el secreto y almacenar su hash en la
 * fila del dispositivo) es una operación ADMINISTRATIVA pendiente; aquí sólo se
 * verifica. No existe endpoint para alta de tokens.
 */

/** SHA-256 del token en hex (64 caracteres). */
export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Compara, en tiempo constante, el token recibido contra el hash almacenado.
 * Devuelve false ante cualquier entrada vacía, hash ausente o con formato no
 * hexadecimal de 64 caracteres.
 */
export function tokenCoincide(
  token: string | undefined | null,
  hashAlmacenado: string | undefined | null,
): boolean {
  if (!token || !hashAlmacenado) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(hashAlmacenado)) return false;

  const calculado = Buffer.from(hashDeviceToken(token), 'hex');
  const guardado = Buffer.from(hashAlmacenado.toLowerCase(), 'hex');
  if (calculado.length !== guardado.length) return false;
  return timingSafeEqual(calculado, guardado);
}
