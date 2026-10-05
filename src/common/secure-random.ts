import { randomInt } from 'crypto';

/** Entero uniforme en [min, max] inclusive (no usa Math.random). */
export function secureRandomInt(min: number, max: number): number {
  return randomInt(min, max + 1);
}

export function randomDigits(length: number): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(secureRandomInt(min, max));
}
