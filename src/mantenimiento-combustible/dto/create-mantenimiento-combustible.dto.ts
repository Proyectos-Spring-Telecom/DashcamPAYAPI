import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
  Min,
  Max,
} from 'class-validator';

export class CreateMantenimientoCombustibleDto {
  @ApiProperty({
    example: 1,
    description: 'ID del tipo de combustible',
    required: false,
  })
  @IsInt({ message: 'El ID del tipo de combustible debe ser un número entero.' })
  @IsOptional()
  idTipoCombustible?: number;

  @ApiProperty({
    example: 50.5,
    description: 'Cantidad de combustible en litros',
    required: false,
  })
  @IsNumber({}, { message: 'La cantidad de combustible debe ser un número.' })
  @Min(0, { message: 'La cantidad de combustible no puede ser negativa.' })
  @IsOptional()
  cantidadCombustible?: number;

  @ApiProperty({
    example: 1250.75,
    description: 'Precio del combustible',
    required: false,
  })
  @IsNumber({}, { message: 'El precio del combustible debe ser un número.' })
  @Min(0, { message: 'El precio del combustible no puede ser negativo.' })
  @IsOptional()
  precioCombustible?: number;

  @ApiProperty({
    example: 1,
    description: 'ID de la instalación relacionada',
    required: false,
  })
  @IsInt({ message: 'El ID de instalación debe ser un número entero.' })
  @IsOptional()
  idInstalacion?: number;

  @ApiProperty({
    example: 1,
    description: 'Estatus del registro (1 = activo, 0 = inactivo)',
    required: false,
    default: 1,
  })
  @IsInt({ message: 'El estatus debe ser un número entero.' })
  @Min(0, { message: 'El estatus no puede ser menor a 0.' })
  @Max(1, { message: 'El estatus no puede ser mayor a 1.' })
  @IsOptional()
  estatus?: number;

  @ApiProperty({
    example: '2024-01-15T10:00:00',
    description: 'Fecha y hora del abastecimiento de combustible',
    required: false,
  })
  @IsDateString({}, { message: 'La fecha y hora debe ser una fecha válida.' })
  @IsOptional()
  fechaHora?: string;

  @ApiProperty({
    example: 15000.5,
    description: 'Kilometraje del vehículo al momento del abastecimiento',
    required: false,
  })
  @IsNumber({}, { message: 'El kilometraje debe ser un número.' })
  @Min(0, { message: 'El kilometraje no puede ser negativo.' })
  @IsOptional()
  kilometraje?: number;

  @ApiProperty({
    example: 1,
    description: 'ID del operador que realizó el abastecimiento',
    required: false,
  })
  @IsInt({ message: 'El ID del operador debe ser un número entero.' })
  @IsOptional()
  idOperador?: number;
}

