import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export enum EnumFiltroMetricas {
  HOY = 1,
  ULTIMOS_7_DIAS = 2,
  MES_ACTUAL = 3,
  AÑO_ACTUAL = 4,
}

export class MetricsFilterDto {
  @Type(() => Number)
  @IsInt()
  @IsEnum(EnumFiltroMetricas, {
    message:
      'El filtro debe ser un valor válido: 1 (hoy), 2 (últimos 7 días), 3 (mes actual), 4 (año actual)',
  })
  @IsOptional()
  @ApiProperty({
    enum: EnumFiltroMetricas,
    description: 'Filtro de período para las métricas: 1 (hoy), 2 (últimos 7 días), 3 (mes actual), 4 (año actual)',
    example: EnumFiltroMetricas.HOY,
    required: false,
    default: EnumFiltroMetricas.HOY,
  })
  filtro?: EnumFiltroMetricas = EnumFiltroMetricas.HOY;
}

