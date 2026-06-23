import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsInt } from 'class-validator';

export class RecaudacionDiariaRutaDto {
  @ApiProperty({
    description: 'Fecha inicial del reporte',
    example: '2024-01-01',
    required: false,
  })
  @IsDateString({}, { message: 'La fecha inicial debe ser una fecha válida.' })
  @IsOptional()
  fechaInicio?: string;

  @ApiProperty({
    description: 'Fecha final del reporte',
    example: '2024-01-31',
    required: false,
  })
  @IsDateString({}, { message: 'La fecha final debe ser una fecha válida.' })
  @IsOptional()
  fechaFin?: string;

  @ApiProperty({
    description: 'ID del cliente para filtrar',
    example: 1,
    required: false,
  })
  @IsInt({ message: 'El ID del cliente debe ser un número entero.' })
  @IsOptional()
  idCliente?: number;

  @ApiProperty({
    description: 'ID de la ruta para filtrar',
    example: 1,
    required: false,
  })
  @IsInt({ message: 'El ID de la ruta debe ser un número entero.' })
  @IsOptional()
  idRuta?: number;

  @ApiProperty({
    description: 'ID del variante para filtrar',
    example: 1,
    required: false,
  })
  @IsInt({ message: 'El ID del variante debe ser un número entero.' })
  @IsOptional()
  idVariante?: number;
}
