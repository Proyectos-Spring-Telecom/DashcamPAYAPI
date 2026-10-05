export const JwtTyp = {
  ACCESS: 'access',
  EMAIL_CONFIRM: 'email_confirm',
  PWD_RESET: 'pwd_reset',
} as const;

export type JwtTypValue = (typeof JwtTyp)[keyof typeof JwtTyp];

export function isAccessTokenTyp(typ: unknown): boolean {
  return typ == null || typ === JwtTyp.ACCESS;
}
