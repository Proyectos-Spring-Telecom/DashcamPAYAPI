import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  IsString,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Helper function para transformar valores de FormData a números
const toNumber = ({ value }: { value: any }): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
};

export class CreateIncidentesDto {
  @ApiProperty({
    example: 1,
    description: 'ID de la instalación relacionada',
    required: true,
  })
  @Transform(toNumber)
  @IsInt({ message: 'El ID de instalación debe ser un número entero.' })
  idInstalacion: number;

  @ApiProperty({
    example: 1,
    description: 'ID del operador relacionado',
    required: true,
  })
  @Transform(toNumber)
  @IsInt({ message: 'El ID de operador debe ser un número entero.' })
  idOperador: number;

  @ApiProperty({
    example: 'Accidente en intersección',
    description: 'Descripción del incidente',
    required: false,
    maxLength: 1000,
  })
  @IsString({ message: 'El incidente debe ser una cadena de texto.' })
  @MaxLength(1000, {
    message: 'El incidente no puede exceder los 1000 caracteres.',
  })
  @IsOptional()
  incidente?: string;

  @ApiProperty({
    example: 1,
    description: 'ID del estatus de mantenimiento relacionado',
    required: false,
  })
  @Transform(toNumber)
  @IsInt({ message: 'El ID de estatus debe ser un número entero.' })
  @IsOptional()
  idEstatus?: number;

  @ApiProperty({
    example: 1,
    description: 'Estatus del incidente (para activar/desactivar)',
    required: false,
  })
  @Transform(toNumber)
  @IsInt({ message: 'El estatus debe ser un número entero.' })
  @IsOptional()
  estatus?: number;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Imagen del incidente (archivo)',
    required: false,
  })
  @IsOptional()
  imagen?: any;

  @ApiProperty({
    example: '2025-01-15T10:30:00',
    description: 'Fecha y hora de registro del incidente',
    required: false,
  })
  @IsDateString(
    {},
    { message: 'La fecha de registro debe ser una fecha válida.' },
  )
  @IsOptional()
  fhRegistro?: string;
}
