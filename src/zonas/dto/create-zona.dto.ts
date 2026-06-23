import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateZonasDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres' })
  @ApiProperty({
    description: 'Nombre de la zona',
    example: 'Zona Norte',
  })
  nombre: string;

  @IsString()
  @IsOptional()
  @MaxLength(255, {
    message: 'La descripción no puede exceder los 255 caracteres',
  })
  @ApiProperty({
    description: 'Descripción de la zona',
    example: 'Cobertura de rutas y vehículos en la zona norte de la ciudad',
    required: false,
  })
  descripcion?: string;

  @ApiPropertyOptional({
    description: 'Geocerca en formato GeoJSON',
    example: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-99.22642966767305, 18.926599475022783],
                [-99.22730864796782, 18.925876896762418],
                [-99.22707843884302, 18.924263457313614],
                [-99.22574950434976, 18.923818026501593],
                [-99.2243787136521, 18.924372340220714],
                [-99.22432639339655, 18.926074863719506],
                [-99.22642966767305, 18.926599475022783],
              ],
            ],
          },
        },
      ],
    },
  })
  @IsOptional()
  @IsObject({ message: 'La geocerca debe ser un objeto válido de GeoJSON' })
  geocerca?: object;

  @IsInt()
  @IsNotEmpty({ message: 'El estatus es obligatorio' })
  @ApiProperty({
    description: 'Estatus de la zona (1 = Activo, 0 = Inactivo)',
    example: 1,
    default: 1,
  })
  estatus: number;

  @IsInt()
  @IsNotEmpty({ message: 'El IdCliente es obligatorio' })
  @ApiProperty({
    description: 'ID del cliente al que pertenece la zona',
    example: 5,
  })
  idCliente: number;
}

