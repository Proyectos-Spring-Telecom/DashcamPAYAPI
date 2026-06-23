import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsNumber,
  IsOptional,
  IsObject,
  IsPositive,
  Min,
  Max,
  IsInt,
  IsIn,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

class PuntoDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
  @IsString()
  @IsOptional()
  nombre: string;
}

export class CreateVarianteDto {
  @ApiProperty({
    description: 'Nombre de la variante',
    example: 'Variante Centro-Norte',
    maxLength: 100,
    type: String,
  })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres' })
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject({ message: 'El punto de inicio debe ser un objeto JSON válido' })
  puntoInicio?: object;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject({ message: 'El punto final debe ser un objeto JSON válido' })
  puntoFin?: object;

  @ApiProperty({
    example: [{ lat: 20.1, lng: -103.1 }, { lat: 20.2, lng: -103.2 }],
    description: 'Recorrido base para interpolación',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PuntoDto)
  recorridoDetallado: PuntoDto[];

  @ApiPropertyOptional({
    description: 'Distancia total de la variante en kilómetros',
    example: 15.75,
    type: Number,
    minimum: 0,
    maximum: 9999.99,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'La distancia debe ser un número con máximo 2 decimales' },
  )
  @Min(0, { message: 'La distancia no puede ser negativa' })
  @Max(9999.99, { message: 'La distancia no puede exceder 9999.99 km' })
  @Type(() => Number)
  distanciaKm?: number;

  @ApiPropertyOptional({
    description: 'Estatus de la variante (1 = Activo, 0 = Inactivo)',
    example: 1,
    type: Number,
    enum: [0, 1],
    default: 1,
  })
  @IsOptional()
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  estatus?: number = 1;

  @ApiProperty({
    description: 'ID de la ruta a la que pertenece la variante',
    example: 1,
    type: Number,
    minimum: 1,
  })
  @IsNotEmpty({ message: 'El ID de la ruta es obligatorio' })
  @IsNumber({}, { message: 'El ID de la ruta debe ser un número' })
  @IsPositive({ message: 'El ID de la ruta debe ser un número positivo' })
  @Type(() => Number)
  idRuta: number;

  @ApiPropertyOptional({
    description: 'Indica si la variante registra regreso',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  registraRegreso?: boolean = false;

  @ApiPropertyOptional({
    description: 'ID del tipo de variante',
    example: 1,
    type: Number,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber({}, { message: 'El ID del tipo de variante debe ser un número' })
  @IsPositive({ message: 'El ID del tipo de variante debe ser un número positivo' })
  @Type(() => Number)
  idTipoVariante?: number;

}

