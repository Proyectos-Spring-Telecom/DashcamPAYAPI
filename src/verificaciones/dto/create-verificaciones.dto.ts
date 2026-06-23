import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, IsDateString, IsObject } from 'class-validator';
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

// Helper function para transformar valores de FormData a JSON
const toJson = ({ value }: { value: any }): object | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  if (typeof value === 'object') {
    return value;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export class CreateVerificacionesDto {
  @ApiProperty({
    example: '2024-01-15',
    description: 'Fecha de la verificación actual',
    required: false,
  })
  @IsDateString(
    {},
    { message: 'La fecha de verificación actual debe ser una fecha válida.' },
  )
  @IsOptional()
  verificacionActual?: string;

  @ApiProperty({
    example: '2025-01-15',
    description: 'Fecha de la próxima verificación',
    required: false,
  })
  @IsDateString(
    {},
    { message: 'La fecha de próxima verificación debe ser una fecha válida.' },
  )
  @IsOptional()
  proximaVerificacion?: string;

  @ApiProperty({
    example: 1,
    description: 'ID de la instalación relacionada',
    required: false,
  })
  @Transform(toNumber)
  @IsInt({ message: 'El ID de instalación debe ser un número entero.' })
  @IsOptional()
  idInstalacion?: number;

  @ApiProperty({
    example: 1,
    description: 'ID del operador relacionado',
    required: false,
  })
  @Transform(toNumber)
  @IsInt({ message: 'El ID de operador debe ser un número entero.' })
  @IsOptional()
  idOperador?: number;

  @Transform(toNumber)
  @IsInt({ message: 'El estatus debe ser un número entero.' })
  @IsOptional()
  estatus?: number;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Imagen de la nota de verificación (archivo)',
    required: false,
  })
  @IsOptional()
  notaVerificacion?: any;

  @ApiProperty({
    example: 1,
    description: 'ID del tipo de verificación',
    required: false,
  })
  @Transform(toNumber)
  @IsInt({
    message: 'El ID de tipo de verificación debe ser un número entero.',
  })
  @IsOptional()
  idTipoVerificacion?: number;

  @ApiProperty({
    example: { categoria: 1, caracteristicas: [{ id: 1, valor: 'Bueno' }] },
    description: 'Evaluación en formato JSON',
    required: false,
  })
  @Transform(toJson)
  @IsObject({ message: 'La evaluación debe ser un objeto JSON válido.' })
  @IsOptional()
  evaluacion?: object;
}
