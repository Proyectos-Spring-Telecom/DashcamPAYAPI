import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { EnumSolicitudPasajero } from 'src/common/estatus.enum';

export class UpdatePasajeroEstadoSolicitudDto {
  @ApiProperty({
    enum: EnumSolicitudPasajero,
    description: 'Estado de solicitud del pasajero',
    example: EnumSolicitudPasajero.SOLICITADO,
  })
  @IsEnum(EnumSolicitudPasajero, {
    message:
      'EstadoSolicitud debe ser un valor válido: ' +
      '0 (No solicitado), 1 (Solicitado), 2 (Aprovado), 3 (Rechazado)',
  })
  @IsNotEmpty()
  estadoSolicitud?: EnumSolicitudPasajero = EnumSolicitudPasajero.NOSOLICITADO;

  @ApiProperty({
    example: 1,
    description: 'ID del tipo pasajero propietario del monedero',
  })
  @IsInt()
  @IsOptional()
  idTipoPasajero?: number;
}
