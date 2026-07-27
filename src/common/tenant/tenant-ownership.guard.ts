import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import {
  TENANT_RESOURCE_KEY,
  TenantResourceOptions,
} from './tenant-resource.decorator';
import {
  ownershipResolvers,
  ROL_SUPER_ADMIN,
  TenantUser,
} from './ownership-resolvers';

/**
 * Guard de autorización a nivel de objeto (multi-tenant / anti-IDOR).
 *
 * Debe ejecutarse DESPUÉS de `JwtAuthGuard` (para tener `req.user`), por lo que
 * se declara así en el controlador:
 *
 *   @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
 *
 * Solo actúa sobre rutas anotadas con `@TenantResource(...)`; el resto pasan
 * sin cambios. Cuando el recurso no pertenece al tenant (o no existe) responde
 * 404, de modo que un id ajeno se comporta igual que un id inexistente y no se
 * filtra la existencia del recurso.
 */
@Injectable()
export class TenantOwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<TenantResourceOptions>(
      TENANT_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Ruta no anotada: el guard no interviene (comportamiento idéntico al actual).
    if (!meta) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as TenantUser | undefined;

    if (!user) {
      // Sin JwtAuthGuard delante no hay identidad que validar.
      throw new UnauthorizedException();
    }

    // Super Administrador ve todo (igual que el `case 1` de los listados).
    if (Number(user.rol) === ROL_SUPER_ADMIN) return true;

    const idParam = meta.idParam ?? 'id';
    const id = request.params?.[idParam];

    // Sin id en la ruta no hay objeto que validar aquí.
    if (id === undefined || id === null) return true;

    const resolver = ownershipResolvers[meta.resolver];
    if (!resolver) {
      // Error de configuración: mejor fallar cerrado que dejar pasar.
      throw new InternalServerErrorException(
        `Resolver de pertenencia no registrado: ${meta.resolver}`,
      );
    }

    const perteneceAlTenant = await resolver(this.dataSource, id, user);
    if (!perteneceAlTenant) {
      // 404 (no 403) para no revelar si el recurso existe en otro tenant.
      throw new NotFoundException('Recurso no encontrado.');
    }

    return true;
  }
}
