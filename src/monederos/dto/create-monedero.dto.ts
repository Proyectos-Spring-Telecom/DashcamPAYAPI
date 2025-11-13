import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  IsNotEmpty,
  IsIn,
} from 'class-validator';

export class CreateMonederoDto {
  @ApiProperty({
    example: 'MON-0001',
    description: 'Número de serie único del monedero',
  })
  @IsString()
  numeroSerie: string;

  @ApiProperty({
    example: 500.0,
    description: 'Saldo inicial del monedero',
    default: 0.0,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saldo: number = 0.0;

  @ApiProperty({
    example: '2025-09-10T10:00:00Z',
    description: 'Fecha de activación del monedero en formato ISO8601',
  })
  @IsDateString()
  @IsOptional()
  fechaActivacion?: string;

  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  @IsOptional()
  @ApiProperty({
    description: 'El estatus es solo 0 ó 1',
    example: '1',
  })
  estatus?: number = 1;

  @ApiProperty({
    example: 2,
    description: 'ID del pasajero (opcional)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  idPasajero?: number | null;

  @ApiProperty({
    example: 1,
    description: 'ID del cliente propietario del monedero',
  })
  @IsInt()
  idCliente: number;
}
