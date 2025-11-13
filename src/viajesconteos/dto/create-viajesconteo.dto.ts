import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateViajesconteoDto {
  @ApiProperty({
    description: 'Identificador del viaje asociado',
    example: 123,
  })
  @IsNotEmpty()
  @IsNumber()
  idViaje: number;

  @ApiProperty({
    description: 'Identificador del conteo de pasajeros asociado',
    example: 456,
  })
  @IsNotEmpty()
  @IsNumber()
  idConteo: number;
}