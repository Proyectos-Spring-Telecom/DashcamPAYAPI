import {
  IsString,
  IsNumber,
  IsDate,
  Length,
  IsInt,
  IsIn,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePosicionesDto {
  @ApiProperty({
    description: 'Exactitud de la posición (1 caracter)',
    example: 'A',
    maxLength: 1,
  })
  @IsString()
  @Length(1, 1)
  @IsOptional()
  exactitud?: string;

  @ApiProperty({
    description: 'Estado de la posición (0 = inactivo, 1 = activo)',
    example: 1,
    required: false,
    default: 0,
  })
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  @IsOptional()
  estado?: number;

  @ApiProperty({
    description: 'Velocidad en km/h con hasta 2 decimales',
    example: 45.75,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  velocidad?: number;

  @ApiProperty({
    description: 'Dirección en grados (0-360) con hasta 2 decimales',
    example: 180.25,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  direccion?: number;

  @ApiProperty({
    description: 'Latitud GPS con hasta 7 decimales',
    example: 19.4326077,
  })
  @IsNumber({ maxDecimalPlaces: 7 })
  @IsOptional()
  latitud?: number;

  @ApiProperty({
    description: 'Longitud GPS con hasta 7 decimales',
    example: -99.133208,
  })
  @IsNumber({ maxDecimalPlaces: 7 })
  @IsOptional()
  longitud?: number;

  @ApiProperty({
    description: 'Fecha y hora de la posición (UTC)',
    example: '2025-09-12T15:45:00Z',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  fechaHora?: Date;

}
