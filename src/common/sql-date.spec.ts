import { BadRequestException } from '@nestjs/common';
import {
  assertDateWindow,
  assertIsoDate,
  assertPositiveInt,
  dateTimeBounds,
} from './sql-date';

describe('assertIsoDate', () => {
  it('acepta YYYY-MM-DD', () => {
    expect(assertIsoDate('2025-09-25')).toBe('2025-09-25');
  });

  it('acepta ISO8601 y devuelve solo el día', () => {
    expect(assertIsoDate('2025-09-25T14:30:00Z')).toBe('2025-09-25');
  });

  it('rechaza inyección y formato inválido', () => {
    expect(() => assertIsoDate("2025-09-25'; DROP TABLE")).toThrow(
      BadRequestException,
    );
    expect(() => assertIsoDate('25/09/2025')).toThrow(BadRequestException);
    expect(() => assertIsoDate('')).toThrow(BadRequestException);
  });
});

describe('assertPositiveInt', () => {
  it('acepta enteros positivos', () => {
    expect(assertPositiveInt(15, 'idUsuario')).toBe(15);
  });

  it('rechaza no enteros e inyección', () => {
    expect(() => assertPositiveInt("1; DROP TABLE", 'id')).toThrow(
      BadRequestException,
    );
    expect(() => assertPositiveInt(0, 'id')).toThrow(BadRequestException);
  });
});

describe('assertDateWindow', () => {
  it('acepta un rango de 92 días', () => {
    expect(() => assertDateWindow('2025-01-01', '2025-04-02')).not.toThrow();
  });

  it('rechaza más de 92 días y un fin anterior al inicio', () => {
    expect(() => assertDateWindow('2025-01-01', '2025-04-03')).toThrow(
      BadRequestException,
    );
    expect(() => assertDateWindow('2025-04-02', '2025-01-01')).toThrow(
      BadRequestException,
    );
  });
});

describe('dateTimeBounds', () => {
  it('arma rango de día completo', () => {
    expect(dateTimeBounds('2025-11-01', '2025-11-14')).toEqual({
      from: '2025-11-01T00:00:00',
      to: '2025-11-14T23:59:59',
      fromZ: '2025-11-01T00:00:00Z',
      toZ: '2025-11-14T23:59:59Z',
      fromSql: '2025-11-01 00:00:00',
      toSql: '2025-11-14 23:59:59',
    });
  });
});
