import {
  bitacoraCanonical,
  canonicalFechaIso,
  coerceBitacoraQuery,
  hmacBitacora,
  stableStringify,
} from './bitacora-hmac';

describe('bitacora-hmac', () => {
  it('ordena claves JSON para que el roundtrip de MySQL coincida', () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(stableStringify({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('parsea query JSON si MySQL lo devolvió como string', () => {
    expect(coerceBitacoraQuery('{"id":7}')).toEqual({ id: 7 });
    expect(coerceBitacoraQuery({ id: 7 })).toEqual({ id: 7 });
    expect(coerceBitacoraQuery('no-json')).toEqual({});
  });

  it('quita milisegundos del ISO', () => {
    expect(canonicalFechaIso(new Date('2026-09-28T18:17:00.123Z'))).toBe(
      '2026-09-28T18:17:00Z',
    );
  });

  it('el hash es estable si el query cambia de orden y la fecha tiene ms', () => {
    const secret = 'test-secret';
    const base = {
      modulo: 'Auth',
      descripcion: 'login',
      accion: 'LOGIN',
      query: { id: 7, monto: 10 },
      estatus: 'SUCCESS',
      error: null,
      idUsuario: 7,
      idModulo: 2,
      fechaCreacion: new Date('2026-09-28T18:17:00.999Z'),
    };
    const shuffled = {
      ...base,
      query: { monto: 10, id: 7 },
      fechaCreacion: new Date('2026-09-28T18:17:00.001Z'),
    };
    expect(hmacBitacora(bitacoraCanonical(base), secret)).toBe(
      hmacBitacora(bitacoraCanonical(shuffled), secret),
    );
  });
});
