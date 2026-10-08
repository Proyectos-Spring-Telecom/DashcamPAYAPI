export const JwtTyp = {
  ACCESS: 'access',
  EMAIL_CONFIRM: 'email_confirm',
  PWD_RESET: 'pwd_reset',
} as const;

export type JwtTypValue = (typeof JwtTyp)[keyof typeof JwtTyp];

/** iss/aud de todos los tokens que emite la API; el access token los exige. */
export const jwtIssuer = (): string => process.env.JWT_ISSUER || 'dashcampay-api';
export const jwtAudience = (): string => process.env.JWT_AUDIENCE || 'dashcampay';
