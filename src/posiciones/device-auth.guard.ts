import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import { Validadores } from 'src/entities/Validadores';
import { Contadores } from 'src/entities/Contadores';
import { ROLES_CONOCIDOS, ROLES_KEY } from 'src/guard/roles.decorator';
import { SecurityFlags } from 'src/common/security-flags';
import { tokenCoincide } from './device-token.util';

export type DeviceEntidad = 'validador' | 'contador';

export const DEVICE_CRED_KEY = 'deviceCredencial';

/**
 * Marca una ruta que acepta credencial de dispositivo por `x-device-token`.
 * `entidad` indica contra qué tabla se verifica y de dónde se toma la serie:
 *   - 'validador' -> Validadores, serie en body.numeroSerieValidador
 *   - 'contador'  -> Contadores,  serie en params.numeroSerie
 */
export const DispositivoCredencial = (entidad: DeviceEntidad) =>
  SetMetadata(DEVICE_CRED_KEY, entidad);

/** Serie de dispositivo: alfanumérica, guion y guion bajo, 1..100. */
const SERIE_RE = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * Guard ADITIVO de ingesta (H-58 / V2-08).
 *
 * Vía 1 (nueva, dispositivo): si llega `x-device-token` y su hash coincide con
 * el `DeviceTokenHash` del dispositivo de la serie correspondiente, autoriza la
 * ingesta sin exigir JWT y marca `req.deviceAuth`.
 *
 * Vía 2 (transición, se MANTIENE): si no hay token de dispositivo, se exige el
 * JWT de operador y se replica la verificación de @Roles (porque la ruta se
 * marca @Public para que los guards globales JwtAuthGuard/RolesGuard no bloqueen
 * la vía de dispositivo).
 *
 * La credencial de dispositivo NO es obligatoria todavía: ambas vías conviven.
 */
@Injectable()
export class DeviceOrJwtGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // Vía 1: credencial de dispositivo.
    const device = await this.verificarDispositivo(context, req);
    if (device) {
      req.deviceAuth = device;
      return true;
    }

    // Vía 2: JWT de operador (se usa AuthGuard('jwt') directo para NO heredar el
    // atajo @Public de JwtAuthGuard: el JWT debe validarse de verdad aquí).
    const okJwt = (await super.canActivate(context)) as boolean;
    if (!okJwt) return false;
    return this.rolPermitido(context, req);
  }

  private async verificarDispositivo(
    context: ExecutionContext,
    req: any,
  ): Promise<{ entidad: DeviceEntidad; numeroSerie: string } | null> {
    const entidad = this.reflector.getAllAndOverride<DeviceEntidad>(
      DEVICE_CRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!entidad) return null;

    const token = req.headers?.['x-device-token'];
    if (typeof token !== 'string' || token.length === 0) return null;

    const serie =
      entidad === 'validador'
        ? req.body?.numeroSerieValidador
        : req.params?.numeroSerie;
    if (typeof serie !== 'string' || !SERIE_RE.test(serie)) return null;

    const repo =
      entidad === 'validador'
        ? this.dataSource.getRepository(Validadores)
        : this.dataSource.getRepository(Contadores);

    const row = await repo.findOne({
      where: { numeroSerie: serie },
      select: ['id', 'numeroSerie', 'deviceTokenHash'],
    });
    if (!row || !tokenCoincide(token, row.deviceTokenHash)) return null;

    return { entidad, numeroSerie: serie };
  }

  /** Réplica de RolesGuard para la vía JWT (la ruta va @Public). */
  private rolPermitido(context: ExecutionContext, req: any): boolean {
    const user = req.user as { rol?: number } | undefined;
    if (!user) return false;
    const rol = Number(user.rol);
    if (!ROLES_CONOCIDOS.includes(rol)) return false;
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
