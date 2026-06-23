import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateMonederoDto {
  @ApiProperty({
    example: 'MON-0001',
    description: 'Número de serie único del monedero',
  })
  @IsString()
  @IsOptional()
  numeroSerie?: string;

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
  estatus?: number;

  @ApiProperty({
    example: 2,
    description: 'ID del pasajero (opcional)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  idPasajero?: number;

  @ApiProperty({
    example: 1,
    description: 'ID del cliente propietario del monedero',
  })
  @IsInt()
  @IsOptional()
  idCliente?: number;

  @ApiProperty({
    example: 'CARD123456789',
    description: 'ID de la tarjeta asociada al monedero',
    required: false,
  })
  @IsString()
  @IsOptional()
  idCard?: string;
}
