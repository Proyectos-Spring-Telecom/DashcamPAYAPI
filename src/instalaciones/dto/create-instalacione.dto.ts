import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateInstalacionesDto {
  @ApiProperty({
    description: 'ID del validador asignado a la instalación',
    example: 1,
  })
  @IsNumber()
  idValidador: number;

  @ApiProperty({
    description: 'ID del contador asignado a la instalación',
    example: 2,
  })
  @IsNumber()
  idContador: number;

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
