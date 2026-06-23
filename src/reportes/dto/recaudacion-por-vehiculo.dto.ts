import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional } from 'class-validator';

export class RecaudacionPorVehiculoDto {
  @ApiProperty({
    example: '2025-11-13',
    description: 'Fecha de inicio para el filtro (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiProperty({
    example: '2025-11-19',
    description: 'Fecha de fin para el filtro (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @ApiProperty({
    example: 1,
    description: 'ID del cliente para filtrar',
    required: false,
  })
  @IsOptional()
  @IsInt()
  idCliente?: number;

  @ApiProperty({
    example: 1,
    description:
      'ID del vehículo para filtrar. Si no se proporciona, se mostrarán todos los vehículos del cliente',
    required: false,
  })
  @IsOptional()
  @IsInt()
  idVehiculo?: number;

  @ApiProperty({
    example: 1,
    description:
      'ID de la ruta para filtrar. Si no se proporciona, se mostrarán todas las rutas',
    required: false,
  })
  @IsOptional()
  @IsInt()
  idRuta?: number;
}
