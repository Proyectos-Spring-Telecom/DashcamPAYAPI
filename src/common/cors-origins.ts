/** Allowlist compartida por HTTP (main.ts) y Socket.IO: CORS_ORIGINS separados por coma. */
export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'https://dashcampay.com')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/** Sin Origin (apps nativas, curl) se permite; el navegador siempre lo manda. */
export function isOriginAllowed(origin: string | undefined): boolean {
  return !origin || corsOrigins().includes(origin);
}
