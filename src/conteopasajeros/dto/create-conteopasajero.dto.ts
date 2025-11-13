import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConteoPasajerosDto {
  @ApiProperty({
    description: 'Número de entradas registradas',
    example: 12,
    required: false,
  })
  @IsInt()
  @IsOptional()
  entradas?: number;

  @ApiProperty({
    description: 'Número de salidas registradas',
    example: 8,
    required: false,
  })
  @IsInt()
  @IsOptional()
  salidas?: number;

  @ApiProperty({
    description: 'Diferencia entre entradas y salidas',
    example: 4,
  })
  @IsInt()
  @IsNotEmpty()
  diferencia: number;

  @ApiProperty({
    description: 'Fecha y hora en la que ocurrió el conteo',
    example: '2025-09-12T14:30:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  fechaHora: Date;

  @ApiProperty({
    description: 'Número de serie del contador que envió el conteo',
    example: 'CNT-00123'
  })
  @IsString()
  numeroSerieContador: string;
}
