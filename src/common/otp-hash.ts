import { createHmac, timingSafeEqual } from 'crypto';

/**
 * OTP guardado como HMAC-SHA256(pepper, idUsuario:tipo:codigo) en hex (64 chars).
 * Cabe en CodigoAutenticacion.Codigo CHAR(64) (migración OtpCodigoHash) y,
 * a diferencia de bcrypt, se compara en tiempo constante sin coste de CPU.
 */
function otpPepper(): string {
  const pepper = process.env.OTP_PEPPER || '';
  if (!pepper) {
    throw new Error('OTP_PEPPER no configurado');
  }
  return pepper;
}

export function hashOtp(idUsuario: number, tipo: number, codigo: string): string {
  return createHmac('sha256', otpPepper())
    .update(`${Number(idUsuario)}:${Number(tipo)}:${String(codigo)}`)
    .digest('hex');
}

export function otpMatchesHash(
  idUsuario: number,
  tipo: number,
  codigo: string,
  stored: string | null | undefined,
): boolean {
  if (!stored || !/^[0-9a-f]{64}$/.test(stored) || !/^\d{6}$/.test(String(codigo ?? ''))) {
    return false;
  }
  const expected = Buffer.from(hashOtp(idUsuario, tipo, codigo), 'hex');
  return timingSafeEqual(expected, Buffer.from(stored, 'hex'));
}
