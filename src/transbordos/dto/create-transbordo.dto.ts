import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
  Min,
  Max,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateDetalleTransbordoDto } from './create-detalle-transbordo.dto';

export class CreateTransbordoDto {
  @ApiProperty({
    description: 'Nombre descriptivo del transbordo permitido',
    example: 'Transbordo Zona Centro',
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres' })
  nombre: string;

  @ApiPropertyOptional({
    description: 'Tiempo permitido para realizar el transbordo en minutos',
    example: 30,
    type: Number,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El tiempo debe ser un número con máximo 2 decimales' },
  )
  @Min(0, { message: 'El tiempo no puede ser negativo' })
  @Type(() => Number)
  tiempo?: number;

  @ApiProperty({
    description: 'Número máximo de transbordos permitidos',
    example: 3,
    type: Number,
    minimum: 1,
  })
  @IsNotEmpty({ message: 'El número de transbordos es obligatorio' })
  @IsInt({ message: 'El número de transbordos debe ser un número entero' })
  @IsPositive({ message: 'El número de transbordos debe ser positivo' })
  @Min(1, { message: 'El número de transbordos debe ser al menos 1' })
  numeroTransbordos: number;

  @ApiProperty({
    description: 'ID del cliente al que pertenece este transbordo',
    example: 5,
    type: Number,
  })
  @IsNotEmpty({ message: 'El ID del cliente es obligatorio' })
  @IsInt({ message: 'El ID del cliente debe ser un número entero' })
  @IsPositive({ message: 'El ID del cliente debe ser positivo' })
  idCliente: number;

  @ApiPropertyOptional({
    description: 'ID del tipo de descuento aplicable al transbordo',
    example: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt({ message: 'El ID del tipo de descuento debe ser un número entero' })
  @IsPositive({ message: 'El ID del tipo de descuento debe ser positivo' })
  idTipoDescuento?: number;

  @ApiProperty({
    description: 'Detalles de los transbordos (costos por cada número de transbordo)',
    type: [CreateDetalleTransbordoDto],
    example: [
      { costo: 5.50, nroTransbordo: 1 },
      { costo: 3.00, nroTransbordo: 2 },
    ],
  })
  @IsArray({ message: 'Los detalles deben ser un array' })
  @ArrayMinSize(1, { message: 'Debe proporcionar al menos un detalle de transbordo' })
  @ValidateNested({ each: true })
  @Type(() => CreateDetalleTransbordoDto)
  detalles: CreateDetalleTransbordoDto[];
}

