import { Module } from '@nestjs/common';
import { BitacoraLoggerService } from './bitacora.service';
import { BitacoraController } from './bitacora.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bitacora } from 'src/entities/Bitacora';

@Module({
  imports: [TypeOrmModule.forFeature([Bitacora])],
  controllers: [BitacoraController],
  providers: [BitacoraLoggerService],
  exports: [BitacoraLoggerService],
})
export class BitacoraModule {}
