import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreateInstalacionesDto {
  @ApiProperty({
    description: 'ID del validador asociado a la instalación',
    example: 101,
  })
  @IsNotEmpty({ message: 'El IdValidador es obligatorio' })
  @IsNumber()
  idValidador: number;

  @ApiProperty({
    description: 'IDs de los contadores asociados a la instalación',
    example: [202, 203],
    type: [Number],
  })
  @IsNotEmpty({ message: 'Los IdContadores son obligatorios' })
  @IsArray({ message: 'IdContadores debe ser un array' })
  @IsNumber({}, { each: true, message: 'Cada IdContador debe ser un número' })
  idContadores: number[];

  @ApiProperty({
    description: 'ID del vehículo asociado a la instalación',
    example: 303,
  })
  @IsNotEmpty({ message: 'El IdVehiculo es obligatorio' })
  @IsNumber()
  idVehiculo: number;

  @ApiProperty({
    description: 'ID del cliente asociado a la instalación',
    example: 404,
  })
  @IsNotEmpty({ message: 'El IdCliente es obligatorio' })
  @IsNumber()
  idCliente: number;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1], { message: 'Solo se permite 0 o 1' })
  @ApiProperty({
    description: 'Estatus del usuario (1=Activo, 0=Inactivo)',
    example: 1,
  })
  estatus?: number = 1;
}
