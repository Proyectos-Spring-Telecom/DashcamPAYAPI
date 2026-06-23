import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { EnumFiltros } from 'src/common/estatus.enum';

export class KpiDto {
  @IsInt()
  @IsNotEmpty({ message: 'El IdCliente es obligatorio' })
  @ApiProperty({
    description: 'ID del cliente al que pertenece la región',
    example: 5,
    required: true,
  })
  idCliente: number;

  @ApiProperty({
    description: 'Fecha y hora de inicio (UTC)',
    example: '2025-09-12',
    required: false,
  })
  @IsDateString({}, { message: 'El fin debe estar en formato ISO8601' })
  @IsOptional()
  fechaInicio?: string;

  @ApiProperty({
    description: 'Fecha y hora de fin(UTC)',
    example: '2025-09-12',
    required: false,
  })
  @IsDateString({}, { message: 'El fin debe estar en formato ISO8601' })
  @IsOptional()
  fechaFin?: string;

  @ApiProperty({
    enum: EnumFiltros,
    description: 'Estado del filtro 1 (Al Dia), 2 (Semana), 3 (Mes)',
    example: EnumFiltros.ALDIA,
    required: false,
  })
  @IsEnum(EnumFiltros, {
    message:
      'Estado del filtro ser un valor válido: ' +
      '1 (Al Dia), 2 (Semana), 3 (Mes)',
  })
  @IsOptional()
  filtro?: EnumFiltros = EnumFiltros.ALDIA;
}
