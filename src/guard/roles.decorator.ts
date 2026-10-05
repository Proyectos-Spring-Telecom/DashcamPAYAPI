import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: number[]) => SetMetadata(ROLES_KEY, roles);

/** Roles que hoy existen en listados. Cualquier otro → 403 (V2-10). */
export const ROLES_CONOCIDOS = [1, 2, 3, 8, 9, 10, 11, 15];
