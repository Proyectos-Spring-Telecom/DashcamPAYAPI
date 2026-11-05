import { dbOffsetMs, formatFechaDb, nowDb } from './clock';

describe('clock', () => {
  const original = process.env.DB_TIME_OFFSET_HOURS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DB_TIME_OFFSET_HOURS;
    } else {
      process.env.DB_TIME_OFFSET_HOURS = original;
    }
  });

  it('usa -6h por defecto (DATETIME naive México)', () => {
    delete process.env.DB_TIME_OFFSET_HOURS;
    expect(dbOffsetMs()).toBe(-6 * 60 * 60 * 1000);
  });

  it('respeta DB_TIME_OFFSET_HOURS=0', () => {
    process.env.DB_TIME_OFFSET_HOURS = '0';
    expect(dbOffsetMs()).toBe(0);
    const before = Date.now();
    const n = nowDb().getTime();
    expect(n).toBeGreaterThanOrEqual(before);
    expect(n).toBeLessThanOrEqual(Date.now() + 50);
  });

  it('formatea YYYY-MM-DD HH:mm:ss', () => {
    expect(formatFechaDb(new Date('2026-09-25T15:04:05'))).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });
});
