import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDetalleTransbordoDto {
  @ApiProperty({
    description: 'Costo del transbordo',
    example: 5.50,
    type: Number,
    minimum: 0,
    maximum: 9999.99,
  })
  @IsNotEmpty({ message: 'El costo es obligatorio' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El costo debe ser un número con máximo 2 decimales' },
  )
  @Min(0, { message: 'El costo no puede ser negativo' })
  @Max(9999.99, { message: 'El costo no puede exceder 9999.99' })
  @Type(() => Number)
  costo: number;

  @ApiProperty({
    description: 'Número de transbordo (secuencia)',
    example: 1,
    type: Number,
    minimum: 1,
  })
  @IsNotEmpty({ message: 'El número de transbordo es obligatorio' })
  @IsInt({ message: 'El número de transbordo debe ser un número entero' })
  @IsPositive({ message: 'El número de transbordo debe ser positivo' })
  @Min(1, { message: 'El número de transbordo debe ser al menos 1' })
  nroTransbordo: number;
}

