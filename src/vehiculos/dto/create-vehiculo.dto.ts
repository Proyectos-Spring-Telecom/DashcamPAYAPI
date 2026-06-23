import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  MaxLength,
  Min,
  Max,
  IsInt,
  IsIn,
  IsDecimal,
  IsPositive,
} from 'class-validator';

export class CreateVehiculoDto {
  @ApiProperty({
    description: 'Marca del vehículo',
    example: 'Toyota',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  marca: string;

  @ApiProperty({
    description: 'Modelo del vehículo',
    example: 'Corolla',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  modelo: string;

  @ApiProperty({
    description: 'Año del vehículo',
    example: 2022,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  ano: number;

  @ApiProperty({
    description: 'Placa del vehículo (única)',
    example: 'ABC1234',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  placa: string;

  @ApiProperty({
    description: 'Número económico interno de la empresa',
    example: 'NE-001',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  numeroEconomico: string;

  @ApiProperty({
    description: 'Tarjeta de circulación (opcional)',
    example: 'tarjeta_123.pdf',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  tarjetaCirculacion?: string;

  @ApiProperty({
    description: 'Póliza de seguro (opcional)',
    example: 'poliza_123.pdf',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  polizaSeguro?: string;

  @ApiProperty({
    description: 'Permiso de concesión (opcional)',
    example: 'permiso_456.pdf',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  permisoConcesion?: string;

  @ApiProperty({
    description: 'Inspección mecánica (opcional)',
    example: 'inspeccion_789.pdf',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  inspeccionMecanica?: string;

  @ApiProperty({
    description: 'Foto del vehículo (opcional)',
    example: 'vehiculo.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  foto?: string;

  @ApiProperty({
    description: 'La capacidad maxima de pasajeros sentados',
    example: 42,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  pasajerosSentados?: number;

  @ApiProperty({
    description: 'La capacidad maxima de pasajeros parados',
    example: 42,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  pasajerosParados?: number;

  @ApiProperty({
    description: 'Cantidad de puertas del vehículo',
    example: 4,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  cantidadPuertas?: number;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1], { message: 'Solo se permite 0 o 1' })
  @ApiProperty({
    description: 'Estatus del usuario (1=Activo, 0=Inactivo)',
    example: 1,
  })
  estatus?: number = 1;

  @ApiProperty({
    description: 'ID del cliente al que pertenece el vehículo',
    example: 1,
  })
  @IsNotEmpty()
  @IsNumber()
  idCliente: number;

  @ApiProperty({
    example: 12.5,
    description: 'Kilómetros por litro según el manual del vehículo.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  km?: number;

  @ApiProperty({
    example: 1,
    description: 'Id del tipo de combustible (referencia al catálogo).',
    required: false,
  })
  @IsOptional()
  @IsInt()
  idCombustible?: number;

  @ApiProperty({
    example: 45.0,
    description: 'Capacidad del tanque en litros.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  capacidadLitros?: number;
}
