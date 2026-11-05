import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from 'src/entities/Usuarios';
import { JwtTyp, jwtAudience, jwtIssuer } from './jwt-types';
import { isTokenVersionAccepted } from './token-version';

export interface AuthUser {
  userId: number;
  email: string;
  cliente: number | null;
  rol: number;
  idOperador?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: jwtIssuer(),
      audience: jwtAudience(),
    });
  }

  /**
   * Rol, cliente y estatus salen de la BD en cada petición, no del payload:
   * un cambio de rol o una baja surten efecto de inmediato. Se devuelven como
   * number porque IdRol/IdCliente son BIGINT y TypeORM los entrega como string,
   * lo que hacía que todo `switch (rol) { case 1: … }` cayera en `default`.
   */
  async validate(payload: any): Promise<AuthUser> {
    if (payload?.typ !== JwtTyp.ACCESS) {
      throw new UnauthorizedException('Token no válido para esta ruta');
    }

    const user = await this.usuariosRepository.findOne({
      where: { id: payload.id },
      select: ['id', 'userName', 'tokenVersion', 'estatus', 'idRol', 'idCliente'],
    });
    if (!user || Number(user.estatus) !== 1) {
      throw new UnauthorizedException('Token no válido para esta ruta');
    }

    if (!isTokenVersionAccepted(payload.tv, Number(user.tokenVersion ?? 0))) {
      throw new UnauthorizedException('Sesión invalidada');
    }

    return {
      userId: Number(user.id),
      email: user.userName,
      cliente: user.idCliente == null ? null : Number(user.idCliente),
      rol: Number(user.idRol),
      idOperador:
        payload.idOperador == null ? undefined : Number(payload.idOperador),
    };
  }
}
