import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(() => {
    service = new LoggerService();
  });

  it('redacta cvv, token y password de forma recursiva', () => {
    const masked = (service as any).maskSensitiveData({
      monto: 50,
      cvv2: '123',
      token: 'eyJhbGciOi',
      nested: { password: 'secret', ok: true },
    });

    expect(masked).toEqual({
      monto: 50,
      cvv2: '[REDACTED]',
      token: '[REDACTED]',
      nested: { password: '[REDACTED]', ok: true },
    });
  });

  it('no imprime el texto de MySQL', () => {
    const safe = (service as any).toSafeError(
      new Error("QueryFailedError: Unknown column 'Clave' in 'field list'"),
    );
    expect(safe.message).toBe('Error interno');
    expect(JSON.stringify(safe)).not.toContain('Unknown column');
  });

  it('no deja los últimos 3 dígitos del CVV', () => {
    const masked = (service as any).maskSensitiveData({ cvv: '987' });
    expect(masked.cvv).toBe('[REDACTED]');
    expect(JSON.stringify(masked)).not.toContain('987');
  });
});
