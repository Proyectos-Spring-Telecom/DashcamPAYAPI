import { BadRequestException } from '@nestjs/common';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Acepta YYYY-MM-DD o ISO8601; devuelve solo el día. Rechaza inyección. */
export function assertIsoDate(value: string, field = 'fecha'): string {
  const raw = String(value ?? '').trim();
  const day = raw.slice(0, 10);
  if (!ISO_DAY.test(day) || /[;'"\\]/.test(raw)) {
    throw new BadRequestException(`${field} debe tener formato YYYY-MM-DD`);
  }
  return day;
}

export function assertPositiveInt(value: unknown, field = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException(`${field} inválido`);
  }
  return n;
}

/** Inclusive. 92 días es el tope de reportes, KPI y conteo. */
export function assertDateWindow(
  inicio: string,
  fin: string,
  maxDays = 92,
): void {
  const fromDay = assertIsoDate(inicio, 'fechaInicio');
  const toDay = assertIsoDate(fin, 'fechaFin');
  const fromMs = Date.parse(`${fromDay}T00:00:00Z`);
  const toMs = Date.parse(`${toDay}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs < fromMs) {
    throw new BadRequestException(
      'fechaFin debe ser posterior o igual a fechaInicio',
    );
  }
  const days = Math.floor((toMs - fromMs) / 86_400_000) + 1;
  if (days > maxDays) {
    throw new BadRequestException(
      `El rango de fechas no puede exceder ${maxDays} días`,
    );
  }
}

export function dateTimeBounds(inicio: string, fin: string) {
  assertDateWindow(inicio, fin);
  const fromDay = assertIsoDate(inicio, 'fechaInicio');
  const toDay = assertIsoDate(fin, 'fechaFin');
  return {
    from: `${fromDay}T00:00:00`,
    to: `${toDay}T23:59:59`,
    fromZ: `${fromDay}T00:00:00Z`,
    toZ: `${toDay}T23:59:59Z`,
    fromSql: `${fromDay} 00:00:00`,
    toSql: `${toDay} 23:59:59`,
  };
}
