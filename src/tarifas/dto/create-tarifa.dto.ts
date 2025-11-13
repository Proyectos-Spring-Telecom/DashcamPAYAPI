import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsIn, Min } from 'class-validator';

export class CreateTarifaDto {
  @ApiProperty({
    example: 35.50,
    description: 'Tarifa base en pesos',
  })
  @IsNotEmpty({ message: 'La tarifa base es obligatoria' })
  @IsNumber({}, { message: 'La tarifa base debe ser numérica' })
  @Min(0, { message: 'La tarifa base no puede ser negativa' })
  tarifaBase: number;

  @ApiProperty({
    example: 5.00,
    description: 'Distancia base en kilómetros',
  })
  @IsNotEmpty({ message: 'La distancia base es obligatoria' })
  @IsNumber({}, { message: 'La distancia base debe ser numérica' })
  @Min(0, { message: 'La distancia base no puede ser negativa' })
  distanciaBaseKm: number;

  @ApiProperty({
    example: 500,
    description: 'Número de metros después de los cuales se aplica el costo adicional',
  })
  @IsNotEmpty({ message: 'El incremento en metros es obligatorio' })
  @IsInt({ message: 'El incremento debe ser un número entero' })
  @Min(1, { message: 'El incremento debe ser mayor a 0' })
  incrementoCadaMetros: number;

  @ApiProperty({
    example: 2.50,
    description: 'Costo adicional aplicado cada X metros',
  })
  @IsNotEmpty({ message: 'El costo adicional es obligatorio' })
  @IsNumber({}, { message: 'El costo adicional debe ser numérico' })
  @Min(0, { message: 'El costo adicional no puede ser negativo' })
  costoAdicional: number;

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
    description: 'Id del Variante asociado a la tarifa',
  })
  @IsNotEmpty({ message: 'El IdVariante es obligatorio' })
  @IsInt({ message: 'El IdVariante debe ser un número entero' })
  idVariante: number;
}
