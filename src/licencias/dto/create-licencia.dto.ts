import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsDateString,
  IsNumber,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  EnumCategoriaLicencia,
  EnumTipoLicencia,
} from 'src/common/estatus.enum';

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

export class CreateLicenciaDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Archivo de la licencia (imagen o PDF)',
    required: false,
  })
  @IsOptional()
  licencia?: any;

  @ApiProperty({
    description: 'Nombre o descripción de la licencia',
    example: 'Licencia Federal Tipo A',
    required: false,
  })
  @IsString()
  @IsOptional()
  nombreLicencia?: string;

  @ApiProperty({
    description: 'Número de la licencia',
    example: 'ABC12345XYZ',
  })
  @IsString()
  @IsNotEmpty()
  numeroLicencia: string;

  @ApiProperty({
    description: 'Fecha en que fue expedida la licencia (YYYY-MM-DD)',
    example: '2023-01-15',
  })
  @IsDateString()
  fechaExpedicion: string;

  @ApiProperty({
    description: 'Fecha de vencimiento de la licencia (YYYY-MM-DD)',
    example: '2026-01-15',
  })
  @IsDateString()
  fechaVencimiento: string;

  @ApiProperty({
    enum: EnumTipoLicencia,
    description: 'Tipo de licencia del operador (A, B, C, D, E o F).',
    example: EnumTipoLicencia.A,
  })
  @Transform(toNumber)
  @IsEnum(EnumTipoLicencia, {
    message:
      'idTipoLicencia debe ser un valor válido: 1(A), 2(B), 3(C), 4(D), 5(E), 6(F)',
  })
  @IsNotEmpty()
  idTipoLicencia: EnumTipoLicencia;

  @ApiProperty({
    enum: EnumCategoriaLicencia,
    description: 'Categoría de la licencia según su tipo de cobertura.',
    example: EnumCategoriaLicencia.FEDERAL,
  })
  @Transform(toNumber)
  @IsEnum(EnumCategoriaLicencia, {
    message:
      'idCategoriaLicencia debe ser un valor válido: 1 (Federal) o 2 (Estatal)',
  })
  @IsNotEmpty()
  idCategoriaLicencia: EnumCategoriaLicencia;

  @ApiProperty({
    description: 'ID del operador al que pertenece la licencia',
    example: 8,
  })
  @Transform(toNumber)
  @IsNumber()
  @IsNotEmpty()
  idOperador: number;
}
