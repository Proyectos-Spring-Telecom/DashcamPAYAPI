import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateMantenimientoVehicularDto {
  @ApiProperty({
    example: 1,
    description: 'ID de la instalación relacionada',
    required: false,
  })
  @Transform(({ value }) => (value ? parseInt(value, 10) : value))
  @IsInt({ message: 'El ID de instalación debe ser un número entero.' })
  @IsOptional()
  idInstalacion?: number;

  @ApiProperty({
    example: 1,
    description: 'ID de la referencia de servicio',
    required: false,
  })
  @Transform(({ value }) => (value ? parseInt(value, 10) : value))
  @IsInt({ message: 'El ID de referencia debe ser un número entero.' })
  @IsOptional()
  idReferencia?: number;

  @ApiProperty({
    example: 'Cambio de aceite y filtros',
    description: 'Descripción del servicio realizado',
    required: false,
    maxLength: 1000,
  })
  @IsString({
    message: 'La descripción del servicio debe ser una cadena de texto.',
  })
  @MaxLength(1000, {
    message: 'La descripción no puede exceder los 1000 caracteres.',
  })
  @IsOptional()
  servicioDescripcion?: string;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Imagen de las notas del servicio (archivo)',
    required: false,
  })
  @IsOptional()
  notaServicio?: any;

  @ApiProperty({
    example: 1,
    description: 'ID del estatus de mantenimiento',
    required: false,
  })
  @Transform(({ value }) => (value ? parseInt(value, 10) : value))
  @IsInt({ message: 'El ID de estatus debe ser un número entero.' })
  @IsOptional()
  idEstatus?: number;

  @ApiProperty({
    example: '2024-01-15T10:00:00',
    description: 'Fecha y hora de inicio del mantenimiento',
    required: false,
  })
  @IsDateString(
    {},
    { message: 'La fecha de inicio debe ser una fecha válida.' },
  )
  @IsOptional()
  fechaInicio?: string;

  @ApiProperty({
    example: '2024-01-15T14:00:00',
    description: 'Fecha y hora de finalización del mantenimiento',
    required: false,
  })
  @IsDateString({}, { message: 'La fecha final debe ser una fecha válida.' })
  @IsOptional()
  fechaFinal?: string;

  @ApiProperty({
    example: 1,
    description: 'ID del centro de servicio (taller)',
    required: false,
  })
  @Transform(({ value }) => (value ? parseInt(value, 10) : value))
  @IsInt({ message: 'El ID del centro de servicio debe ser un número entero.' })
  @IsOptional()
  idTaller?: number;

  @ApiProperty({
    example: 1500.5,
    description: 'Costo del mantenimiento',
    required: false,
  })
  @Transform(({ value }) => (value ? parseFloat(value) : value))
  @IsNumber({}, { message: 'El costo debe ser un número.' })
  @Min(0, { message: 'El costo no puede ser negativo.' })
  @IsOptional()
  costo?: number;

  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Nombre del encargado del servicio',
    required: false,
    maxLength: 200,
  })
  @IsString({ message: 'El encargado debe ser una cadena de texto.' })
  @MaxLength(200, {
    message: 'El nombre del encargado no puede exceder los 200 caracteres.',
  })
  @IsOptional()
  encargado?: string;
}
