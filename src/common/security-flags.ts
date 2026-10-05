/**
 * Enforce activo por defecto. Para volver a compatible: ENFORCE_*=false.
 */
function flag(name: string): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return true;
  return String(raw).toLowerCase() === 'true';
}

export const SecurityFlags = {
  /** PIN no reasigna validador; PATCH validador / generar PIN solo admin. */
  pinBinding: () => flag('ENFORCE_PIN_BINDING'),
  /** Rechaza cvv2 en customers/token. WebApp debe dejar de enviarlo primero. */
  cvv2Forbidden: () => flag('ENFORCE_CVV2_FORBIDDEN'),
  /** verify exige userName (deja de tomar el último OTP global). */
  verifyUserName: () => flag('ENFORCE_VERIFY_USERNAME'),
  /** Débito exige claveIdempotencia. */
  idempotencyKey: () => flag('ENFORCE_IDEMPOTENCY_KEY'),
  /** Recarga efectivo/transferencia solo roles 1/2/3/11 (pasajero 9 sigue bloqueado). */
  cashRechargeRoles: () => flag('ENFORCE_CASH_RECHARGE_ROLES'),
  /** Ruta autenticada sin @Roles → 403. false = pasa si el rol es conocido. */
  rolesDenyDefault: () => flag('ENFORCE_ROLES_DENY_DEFAULT'),
};
