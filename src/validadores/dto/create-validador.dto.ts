import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  MaxLength,
  IsIn,
  IsEnum,
} from 'class-validator';
import { EstadoComponente } from 'src/common/estatus.enum';

export class CreateValidadorDto {
  @IsString()
  @IsNotEmpty({ message: 'El número de serie es obligatorio' })
  @MaxLength(100, {
    message: 'El número de serie no puede exceder 100 caracteres',
  })
  @ApiProperty({
    description: 'Número de serie único del Validador',
    example: 'SN1234567890',
  })
  numeroSerie: string;

  @IsString()
  @IsNotEmpty({ message: 'La marca es obligatoria' })
  @MaxLength(100, { message: 'La marca no puede exceder 100 caracteres' })
  @ApiProperty({ description: 'Marca del Validador', example: 'Samsung' })
  marca: string;

  @IsString()
  @IsNotEmpty({ message: 'El modelo es obligatorio' })
  @MaxLength(100, { message: 'El modelo no puede exceder 100 caracteres' })
  @ApiProperty({ description: 'Modelo del Validador', example: 'Galaxy X1' })
  modelo: string;

  @IsOptional()
  @IsInt({ message: 'Estatus debe ser 0 ó 1' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  @ApiProperty({ description: 'Estatus del cliente', example: 1 })
  estatus?: number = 1;

  @ApiProperty({
    enum: EstadoComponente,
    description: 'Estado actual del componente',
    example: EstadoComponente.DISPONIBLE,
  })
  @IsEnum(EstadoComponente, {
    message:
      'estadoActual debe ser un valor válido: ' +
      '0 (Inactivo), 1 (Disponible), 2 (Asignado), 3 (En Mantenimiento), 4 (Dañado), 5 (Retirado)',
  })
  @IsOptional()
  estadoActual?: EstadoComponente = EstadoComponente.DISPONIBLE;

  @IsInt({ message: 'IdCliente debe ser un número entero' })
  @ApiProperty({
    description: 'Id del cliente propietario del Validador',
    example: 5,
  })
  idCliente: number;
}
