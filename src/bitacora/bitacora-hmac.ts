import { createHmac, timingSafeEqual } from 'crypto';

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  // Igual que JSON.stringify (lo que se guarda en la columna JSON): las claves
  // con undefined no existen. Antes se hasheaban como null y el registro nunca
  // volvía a verificar (p. ej. un DTO con campos opcionales sin enviar).
  const keys = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`;
}

/** DATETIME MySQL pierde milisegundos; el HMAC no debe depender de ellos. */
export function canonicalFechaIso(
  fecha: Date | string | null | undefined,
): string {
  if (!fecha) return '';
  const date = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export type BitacoraHmacFields = {
  modulo: string | null;
  descripcion: string | null;
  accion: string | null;
  query: object | null;
  estatus: string | null;
  error: string | null;
  idUsuario: number;
  idModulo: number;
  fechaCreacion: Date | string | null;
};

export function bitacoraCanonical(row: BitacoraHmacFields): string {
  return [
    row.modulo ?? '',
    row.descripcion ?? '',
    row.accion ?? '',
    stableStringify(row.query ?? {}),
    row.estatus ?? '',
    row.error ?? '',
    String(row.idUsuario),
    String(row.idModulo),
    canonicalFechaIso(row.fechaCreacion),
  ].join('|');
}

export function hmacBitacora(canonical: string, secret: string): string {
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

/** Incluye el hash de la fila anterior. Las filas viejas no lo tienen. */
export function bitacoraCanonicalEncadenado(
  row: BitacoraHmacFields,
  hashAnterior: string | null | undefined,
): string {
  return `${bitacoraCanonical(row)}|${hashAnterior ?? ''}`;
}

export function hashesIguales(
  almacenado: string | null | undefined,
  esperado: string,
): boolean {
  if (!almacenado || almacenado.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(almacenado), Buffer.from(esperado));
}

/** MySQL JSON a veces vuelve como string; el HMAC debe usar el mismo objeto. */
export function coerceBitacoraQuery(query: unknown): object | null {
  if (query == null) return null;
  if (typeof query === 'string') {
    try {
      const parsed = JSON.parse(query);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof query === 'object') return query as object;
  return {};
}
