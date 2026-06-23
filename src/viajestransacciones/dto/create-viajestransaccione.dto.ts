import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateViajestransaccioneDto {
  @ApiProperty({
    description: 'Identificador del viaje asociado',
    example: 101,
  })
  @IsNotEmpty()
  @IsNumber()
  idViaje: number;

  @ApiProperty({
    description: 'Identificador de la transacción asociada',
    example: 2501,
  })
  @IsOptional()
  @IsNumber()
  idTransaccionDebito?: number;

  @ApiProperty({
    description: 'Identificador de la transacción asociada',
    example: 2501,
  })
  @IsOptional()
  @IsNumber()
  idTransaccionRecarga?: number;
}
