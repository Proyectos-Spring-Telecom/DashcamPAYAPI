/** Horas a sumar al reloj al persistir/comparar DATETIME naive de MySQL. */
export function dbOffsetMs(): number {
  const hours = Number(process.env.DB_TIME_OFFSET_HOURS ?? -6);
  if (!Number.isFinite(hours)) return -6 * 60 * 60 * 1000;
  return hours * 60 * 60 * 1000;
}

export function nowDb(): Date {
  return new Date(Date.now() + dbOffsetMs());
}

export function formatFechaDb(fecha: Date = nowDb()): string {
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${fecha.getUTCFullYear()}-${pad(fecha.getUTCMonth() + 1)}-${pad(fecha.getUTCDate())} ${pad(fecha.getUTCHours())}:${pad(fecha.getUTCMinutes())}:${pad(fecha.getUTCSeconds())}`;
}
