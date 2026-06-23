//Modulo Usuario
import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuarios } from 'src/entities/Usuarios';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { ClientesModule } from 'src/clientes/clientes.module';
import { PermisosModule } from 'src/permisos/permisos.module';
import { UsuariosPermisos } from 'src/entities/UsuariosPermisos';
import { MailModule } from 'src/mail/mail.module';
import { AuthModule } from 'src/auth/auth.module';
import { Clientes } from 'src/entities/Clientes';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Validadores } from 'src/entities/Validadores';
import { S3Module } from 'src/s3/s3.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Usuarios,
      UsuariosPermisos,
      Clientes,
      Validadores,
      UsuariosZonas,
    ]),
    BitacoraModule,
    ClientesModule,
    PermisosModule,
    MailModule,
    AuthModule,
    S3Module,
  ],
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
