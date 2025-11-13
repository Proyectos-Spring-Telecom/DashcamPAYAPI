import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateViajeDto {
  @ApiProperty({
    description: 'Fecha y hora de inicio del viaje',
    example: '2025-09-12T12:00:00.000Z',
  })
  @IsNotEmpty({ message: 'El inicio es obligatorio' })
  @IsDateString({}, { message: 'El inicio debe ser una fecha en formato ISO' })
  inicio: Date;

  @ApiProperty({
    description: 'Fecha y hora de fin del viaje (puede ser nula)',
    example: '2025-09-12T14:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString({}, { message: 'El fin debe ser una fecha en formato ISO' })
  fin?: Date | null;

  @IsNotEmpty({ message: 'Confirmar estatus en valor de 0 ó 1' })
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  estatus: number = 1;

  @ApiProperty({
    description: 'Id del cliente asociado al viaje',
    example: 5,
  })
  @IsNotEmpty({ message: 'El IdCliente es obligatorio' })
  @IsInt({ message: 'IdCliente debe ser un número entero' })
  idCliente: number;

  @ApiProperty({
    description: 'Id del turno asociado al viaje',
    example: 3,
  })
  @IsNotEmpty({ message: 'El IdTurno es obligatorio' })
  @IsInt({ message: 'IdTurno debe ser un número entero' })
  idTurno: number;

  @ApiProperty({
    description: 'Id del operador asociado al viaje',
    example: 12,
  })
  @IsNotEmpty({ message: 'El IdOperador es obligatorio' })
  @IsInt({ message: 'IdOperador debe ser un número entero' })
  idOperador: number;

  @ApiProperty({
    description: 'Id del variante asociado al viaje',
    example: 20,
  })
  @IsNotEmpty({ message: 'El Idvariante es obligatorio' })
  @IsInt({ message: 'Idvariante debe ser un número entero' })
  idvariante: number;
}
