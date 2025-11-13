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
    description: 'Geocerca',
    example: { lat: 18.12345, lng: -99.12345 },
  })
  @IsOptional()
  @IsObject()
  geocerca?: object | null;

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
