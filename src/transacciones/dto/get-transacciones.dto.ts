import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class GetTransaccioneDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'La página es obligatoria' })
  @ApiProperty({
    description: 'Número de página',
    example: 1,
    required: true,
  })
  page: number;

  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'El límite es obligatorio' })
  @ApiProperty({
    description: 'Cantidad de registros por página',
    example: 20,
    required: true,
  })
  limit: number;

  @ApiProperty({
    description: 'Fecha y hora de inicio (UTC)',
    example: '2025-09-12',
    required: false,
  })
  @IsDateString(
    {},
    { message: 'La fecha de inicio debe estar en formato ISO8601' },
  )
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
}
