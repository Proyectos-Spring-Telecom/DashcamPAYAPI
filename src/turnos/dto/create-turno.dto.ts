import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsIn } from 'class-validator';

export class CreateTurnoDto {
  @ApiProperty({
    description: 'Fecha y hora de inicio del turno (UTC)',
    example: '2025-09-12T08:00:00Z',
  })
  @IsNotEmpty({ message: 'El inicio es obligatorio' })
  @IsDateString({}, { message: 'El inicio debe estar en formato ISO8601' })
  inicio: Date;

  @ApiProperty({
    description: 'Fecha y hora de fin del turno (UTC)',
    example: '2025-09-12T16:00:00Z',
    required: false,
  })
  @IsDateString({}, { message: 'El fin debe estar en formato ISO8601' })
  fin?: Date;

  @ApiProperty({
    description: 'Estatus del turno (1 = Activo, 0 = Inactivo)',
    example: 1,
    default: 1,
  })
  @IsInt({ message: 'El estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'El estatus solo puede ser 0 ó 1' })
  estatus: number = 1;

  @ApiProperty({
    description: 'ID del cliente asociado al turno',
    example: 101,
  })
  @IsInt({ message: 'El IdCliente debe ser un número entero' })
  @IsNotEmpty({ message: 'El IdCliente es obligatorio' })
  idCliente: number;

  @ApiProperty({
    description: 'ID del operador asociado al turno',
    example: 55,
  })
  @IsInt({ message: 'El IdOperador debe ser un número entero' })
  @IsNotEmpty({ message: 'El IdOperador es obligatorio' })
  idOperador: number;

  @ApiProperty({
    description: 'ID de la instalación asociada al turno',
    example: 300,
  })
  @IsInt({ message: 'El IdInstalacion debe ser un número entero' })
  @IsNotEmpty({ message: 'El IdInstalacion es obligatorio' })
  idInstalacion: number;
}
