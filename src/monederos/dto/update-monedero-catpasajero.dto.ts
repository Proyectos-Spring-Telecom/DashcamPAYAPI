import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty } from 'class-validator';

export class UpdateMonederoCatPasajeroDto {
  @ApiProperty({
    example: 1,
    description: 'ID del tipo pasajero propietario del monedero',
  })
  @IsNotEmpty({ message: 'Confirmar estatus en valor de 0 ó 1' })
  @IsInt({ message: 'estatus debe ser un número entero' })
  idTipoPasajero: number;
}
