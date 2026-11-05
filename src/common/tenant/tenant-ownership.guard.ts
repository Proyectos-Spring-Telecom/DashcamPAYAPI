import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import {
  TENANT_EXEMPT_KEY,
  TENANT_RESOURCE_KEY,
  TenantResourceOptions,
} from './tenant-resource.decorator';
import {
  ownershipResolvers,
  RESOLVERS_OPAQUE,
  ROL_SUPER_ADMIN,
  TenantUser,
} from './ownership-resolvers';

/** Parámetros de ruta que no identifican un objeto (mismo criterio que lint:tenant). */
export const PARAMS_NO_OBJETO = new Set([
  'page',
  'limit',
  'fecha',
  'fechaInicio',
  'fechaFin',
  'hora',
  'year',
  'month',
  'estatus',
  'cp',
]);

/**
 * Guard de autorización a nivel de objeto (multi-tenant / anti-IDOR).
 *
 * Debe ejecutarse DESPUÉS de `JwtAuthGuard` (para tener `req.user`), por lo que
 * se declara así en el controlador:
 *
 *   @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
 *
 * Valida las rutas anotadas con `@TenantResource(...)`. Una ruta con parámetro
 * de objeto sin `@TenantResource` ni `@TenantExempt(motivo)` se niega
 * (fail-closed). Cuando el recurso no pertenece al tenant (o no existe) responde
 * 404, de modo que un id ajeno se comporta igual que un id inexistente y no se
 * filtra la existencia del recurso.
 */
@Injectable()
export class TenantOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(TenantOwnershipGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<TenantResourceOptions>(
      TENANT_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();

    if (!meta) {
      const exenta = this.reflector.getAllAndOverride<string>(
        TENANT_EXEMPT_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (exenta) return true;
      // Fail-closed: una ruta con parámetro de objeto que pasa por este guard
      // debe declarar @TenantResource o @TenantExempt(motivo).
      const params = Object.keys(request.params ?? {}).filter(
        (p) => !PARAMS_NO_OBJETO.has(p),
      );
      if (params.length === 0) return true;
      this.logger.error(
        `Ruta sin @TenantResource/@TenantExempt: ${request.method} ${request.route?.path ?? ''}`,
      );
      throw new NotFoundException('Recurso no encontrado.');
    }
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

    // Formato antes de consultar: un id raro ("1 OR 1", "1e3", " 7") no debe
    // llegar al resolver ni distinguirse de uno inexistente.
    // H-66: los resolvers opacos aceptan también el PublicId (ULID, 26 chars
    // Crockford base32). El resto sigue restringido a `^\d{1,19}$`.
    const formato = meta.resolver.endsWith('BySerie')
      ? /^[A-Za-z0-9_-]{1,100}$/
      : RESOLVERS_OPAQUE.has(meta.resolver)
        ? /^(\d{1,19}|[0-9A-HJKMNP-TV-Z]{26})$/
        : /^\d{1,19}$/;
    if (!formato.test(String(id))) {
      throw new NotFoundException('Recurso no encontrado.');
    }

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
