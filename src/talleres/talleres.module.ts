import { Module } from '@nestjs/common';
import { TalleresService } from './talleres.service';
import { TalleresController } from './talleres.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Talleres } from 'src/entities/Talleres';
import { BitacoraModule } from 'src/bitacora/bitacora.module';
import { Clientes } from 'src/entities/Clientes';

@Module({
  imports: [TypeOrmModule.forFeature([Talleres, Clientes]), BitacoraModule],
  controllers: [TalleresController],
  providers: [TalleresService],
})
export class TalleresModule {}
