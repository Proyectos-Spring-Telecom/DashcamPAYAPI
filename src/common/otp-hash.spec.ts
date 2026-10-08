import { hashOtp, otpMatchesHash } from './otp-hash';

describe('otp-hash', () => {
  beforeAll(() => {
    process.env.OTP_PEPPER = 'pepper-de-prueba';
  });

  it('produce 64 hex que caben en CHAR(64)', () => {
    expect(hashOtp(7, 1, '123456')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('acepta el código correcto del mismo usuario y tipo', () => {
    const h = hashOtp(7, 1, '123456');
    expect(otpMatchesHash(7, 1, '123456', h)).toBe(true);
  });

  it('rechaza otro usuario, otro tipo u otro código', () => {
    const h = hashOtp(7, 1, '123456');
    expect(otpMatchesHash(8, 1, '123456', h)).toBe(false);
    expect(otpMatchesHash(7, 2, '123456', h)).toBe(false);
    expect(otpMatchesHash(7, 1, '123457', h)).toBe(false);
  });

  it('rechaza valores heredados (texto plano o bcrypt) y entradas mal formadas', () => {
    expect(otpMatchesHash(7, 1, '123456', '123456')).toBe(false);
    expect(otpMatchesHash(7, 1, '123456', '$2b$10$abc')).toBe(false);
    expect(otpMatchesHash(7, 1, '12345', hashOtp(7, 1, '12345'))).toBe(false);
    expect(otpMatchesHash(7, 1, '123456', null)).toBe(false);
  });
});
