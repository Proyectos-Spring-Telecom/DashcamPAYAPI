import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from 'src/entities/Usuarios';
import { isAccessTokenTyp } from './jwt-types';
import {
  isMissingTokenVersionColumn,
  isTokenVersionAccepted,
} from './token-version';

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
    });
  }

  async validate(payload: any) {
    if (!isAccessTokenTyp(payload?.typ)) {
      throw new UnauthorizedException('Token no válido para esta ruta');
    }

    let user: Pick<Usuarios, 'id' | 'tokenVersion' | 'estatus'> | null;
    try {
      user = await this.usuariosRepository.findOne({
        where: { id: payload.id },
        select: ['id', 'tokenVersion', 'estatus'],
      });
    } catch (error) {
      if (!isMissingTokenVersionColumn(error)) {
        throw error;
      }
      user = await this.usuariosRepository.findOne({
        where: { id: payload.id },
        select: ['id', 'estatus'],
      });
      if (user) {
        user.tokenVersion = 0;
      }
    }
    if (!user || user.estatus !== 1) {
      throw new UnauthorizedException('Token no válido para esta ruta');
    }

    if (!isTokenVersionAccepted(payload.tv, Number(user.tokenVersion ?? 0))) {
      throw new UnauthorizedException('Sesión invalidada');
    }

    return {
      userId: payload.id,
      email: payload.email,
      cliente: payload.cliente,
      rol: payload.rol,
      idOperador: payload.idOperador,
    };
  }
}
