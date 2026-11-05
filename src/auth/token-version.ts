export function isMissingTokenVersionColumn(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? '');
  return /TokenVersion/i.test(msg) && /Unknown column|ER_BAD_FIELD_ERROR/i.test(msg);
}

export function isTokenVersionAccepted(
  payloadTv: unknown,
  currentTv: number,
): boolean {
  if (payloadTv == null) {
    return currentTv === 0;
  }
  return Number(payloadTv) === currentTv;
}
