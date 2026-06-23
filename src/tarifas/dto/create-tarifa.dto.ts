import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsIn,
  Min,
  IsOptional,
} from 'class-validator';

export class CreateTarifaDto {
  @ApiProperty({
    example: 35.5,
    description: 'Tarifa base en pesos',
  })
  @IsNotEmpty({ message: 'La tarifa base es obligatoria' })
  @IsNumber({}, { message: 'La tarifa base debe ser numérica' })
  @Min(0, { message: 'La tarifa base no puede ser negativa' })
  tarifaBase: number;

  @ApiProperty({
    example: 5.0,
    description: 'Distancia base en kilómetros',
  })
  @IsOptional({ message: 'La distancia base no es obligatoria' })
  @IsNumber({}, { message: 'La distancia base debe ser numérica' })
  @Min(0, { message: 'La distancia base no puede ser negativa' })
  distanciaBaseKm?: number;

  @ApiProperty({
    example: 500,
    description:
      'Número de metros después de los cuales se aplica el costo adicional',
  })
  @IsOptional({ message: 'El incremento en metros es no obligatorio' })
  @IsInt({ message: 'El incremento debe ser un número entero' })
  @Min(1, { message: 'El incremento debe ser mayor a 0' })
  incrementoCadaMetros?: number;

  @ApiProperty({
    example: 2.5,
    description: 'Costo adicional aplicado cada X metros',
  })
  @IsOptional({ message: 'El costo adicional es obligatorio' })
  @IsNumber({}, { message: 'El costo adicional debe ser numérico' })
  @Min(0, { message: 'El costo adicional no puede ser negativo' })
  costoAdicional?: number;

  @ApiProperty({
    example: 5.0,
    description: 'Costo por estación',
    required: false,
  })
  @IsOptional()
  @IsNumber({}, { message: 'El costo por estación debe ser numérico' })
  @Min(0, { message: 'El costo por estación no puede ser negativo' })
  costoPorEstacion?: number;

  @ApiProperty({
    example: 3,
    description: 'Cantidad de estaciones base',
    required: false,
  })
  @IsOptional()
  @IsInt({
    message: 'La cantidad de estaciones base debe ser un número entero',
  })
  @Min(0, { message: 'La cantidad de estaciones base no puede ser negativa' })
  cantidadEstacionesBase?: number;

  @ApiProperty({
    description:
      'ID del tipo de tarifa. Debe ser un ID válido del catálogo de tipos de tarifa (obtener desde /cat-tipo-tarifa)',
    required: true,
  })
  @IsNotEmpty({ message: 'El tipo de tarifa es obligatorio' })
  @IsInt({ message: 'El idTipoTarifa debe ser un número entero' })
  @Min(1, { message: 'El idTipoTarifa debe ser un número entero positivo' })
  idTipoTarifa: number;

  @ApiProperty({
    example: 1,
    description: 'Estatus de la tarifa (0 = inactivo, 1 = activo)',
    default: 1,
  })
  @IsInt({ message: 'El estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'El estatus solo puede ser 0 o 1' })
  estatus: number = 1;

  @ApiProperty({
    example: 2001,
    description: 'Id de la variante asociada a la tarifa',
  })
  @IsNotEmpty({ message: 'El IdVariante es obligatorio' })
  @IsInt({ message: 'El IdVariante debe ser un número entero' })
  idVariante: number;
}
