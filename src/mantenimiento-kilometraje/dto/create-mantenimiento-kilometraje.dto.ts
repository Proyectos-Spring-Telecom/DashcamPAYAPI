import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, IsNumber, Min, Max } from 'class-validator';

export class CreateMantenimientoKilometrajeDto {
  @ApiProperty({
    example: 1,
    description: 'ID de la instalación relacionada',
    required: false,
  })
  @IsInt({ message: 'El ID de instalación debe ser un número entero.' })
  @IsOptional()
  idInstalacion?: number;

  @ApiProperty({
    example: 10000.5,
    description: 'Kilometraje inicial del vehículo',
    required: false,
  })
  @IsNumber({}, { message: 'El kilometraje inicial debe ser un número.' })
  @Min(0, { message: 'El kilometraje inicial no puede ser negativo.' })
  @IsOptional()
  kmInicial?: number;

  @ApiProperty({
    example: 15000.0,
    description: 'Kilometraje deseado para el mantenimiento',
    required: false,
  })
  @IsNumber({}, { message: 'El kilometraje deseado debe ser un número.' })
  @Min(0, { message: 'El kilometraje deseado no puede ser negativo.' })
  @IsOptional()
  kmDeseado?: number;

  @ApiProperty({
    example: 5000,
    description: 'Periodo de mantenimiento en kilómetros',
    required: false,
  })
  @IsInt({ message: 'El periodo debe ser un número entero.' })
  @Min(0, { message: 'El periodo no puede ser negativo.' })
  @IsOptional()
  periodo?: number;

  @ApiProperty({
    example: 2024,
    description: 'Año del mantenimiento',
    required: false,
  })
  @IsInt({ message: 'El año debe ser un número entero.' })
  @Min(1900, { message: 'El año debe ser mayor a 1900.' })
  @Max(2100, { message: 'El año debe ser menor a 2100.' })
  @IsOptional()
  anio?: number;
}
