import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Usuarios } from "src/entities/Usuarios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { UsuariosPermisos } from "src/entities/UsuariosPermisos";
import { JwtStrategy } from "./jwt.strategy";
import { MailModule } from "src/mail/mail.module";
import { BitacoraModule } from "src/bitacora/bitacora.module";
import { MonederosModule } from "src/monederos/monederos.module";
import { PasajerosModule } from "src/pasajeros/pasajeros.module";
import { CodigoAutenticacion } from "src/entities/CodigoAutenticacion";

@Module({
  imports: [
    MailModule,
    BitacoraModule,
    MonederosModule,
    PasajerosModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_EXPIRES_IN") as any },
      }),
    }),

    TypeOrmModule.forFeature([Usuarios, UsuariosPermisos,CodigoAutenticacion]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
