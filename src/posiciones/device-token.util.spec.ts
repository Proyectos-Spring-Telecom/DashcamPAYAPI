import { hashDeviceToken, tokenCoincide } from './device-token.util';

describe('device-token.util', () => {
  const token = 'sk_device_abc123';
  const hash = hashDeviceToken(token);

  it('hashDeviceToken devuelve SHA-256 en hex de 64 caracteres', () => {
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Determinista.
    expect(hashDeviceToken(token)).toBe(hash);
  });

  it('acepta el token cuyo hash coincide', () => {
    expect(tokenCoincide(token, hash)).toBe(true);
    // Insensible a mayúsculas en el hash almacenado.
    expect(tokenCoincide(token, hash.toUpperCase())).toBe(true);
  });

  it('rechaza token incorrecto o entradas inválidas', () => {
    expect(tokenCoincide('otro', hash)).toBe(false);
    expect(tokenCoincide('', hash)).toBe(false);
    expect(tokenCoincide(token, null)).toBe(false);
    expect(tokenCoincide(token, undefined)).toBe(false);
    expect(tokenCoincide(token, 'no-es-hex')).toBe(false);
  });
});
