import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_CONOCIDOS, ROLES_KEY } from './roles.decorator';
import { SecurityFlags } from 'src/common/security-flags';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { rol?: number } | undefined;
    if (!user) return false;

    const rol = Number(user.rol);
    if (!ROLES_CONOCIDOS.includes(rol)) {
      return false;
    }

    const required = this.reflector.getAllAndOverride<number[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return !SecurityFlags.rolesDenyDefault();
    }
    return required.includes(rol);
  }
}
