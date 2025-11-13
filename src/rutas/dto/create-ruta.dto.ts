import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsObject,
  IsInt,
  IsIn,
} from 'class-validator';

export class CreateRutaDto {
  @ApiProperty({
    description: 'Nombre de la ruta',
    example: 'Ruta Centro - Norte',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({
    description: 'Punto inicial en formato JSON (ejemplo: coordenadas)',
    example: { lat: 18.12345, lng: -99.12345 },
  })
  @IsOptional()
  @IsObject()
  puntoInicio?: object | null;

  @ApiPropertyOptional({
    description: 'Nombre de la direccion de punto inicio',
    example: 'Centro',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  nombreInicio?: string;

  @ApiPropertyOptional({
    description: 'Punto final en formato JSON (ejemplo: coordenadas)',
    example: { lat: 18.54321, lng: -99.54321 },
  })
  @IsOptional()
  @IsObject()
  puntoFin?: object | null;

  @ApiPropertyOptional({
    description: 'Nombre de la direccion de punto final',
    example: 'Norte',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  nombreFin?: string;

  @ApiProperty({
    description: 'Estatus de la ruta (1 = activo, 0 = inactivo)',
    example: 1,
    default: 1,
  })
  @IsNotEmpty({ message: 'Confirmar estatus en valor de 0 ó 1' })
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  estatus: number = 1;

  @ApiProperty({
    description: 'Identificador de la zona de inicio asociada',
    example: 2,
  })
  @IsNumber()
  @IsNotEmpty()
  idZona: number;

  @ApiPropertyOptional({
    description: 'Identificador de la zona final asociada (opcional)',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  idZonaFin?: number | null;
}
