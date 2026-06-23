import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export class CreateViajeDto {
  @IsOptional()
  @IsDateString({}, { message: 'El inicio debe ser una fecha en formato ISO' })
  inicio?: Date;

  @IsOptional()
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  estatus?: number = 1;

  @IsOptional({ message: 'El IdCliente es obligatorio' })
  @IsInt({ message: 'IdCliente debe ser un número entero' })
  idCliente?: number;

  @ApiProperty({
    description: 'Id del turno asociado al viaje',
    example: 3,
  })
  @IsNotEmpty({ message: 'El IdTurno es obligatorio' })
  @IsInt({ message: 'IdTurno debe ser un número entero' })
  idTurno: number;

  @IsOptional()
  @IsInt({ message: 'IdOperador debe ser un número entero' })
  idOperador?: number;

  @ApiProperty({
    description: 'Id de la variante asociada al viaje',
    example: 20,
  })
  @IsNotEmpty({ message: 'El IdVariante es obligatorio' })
  @IsInt({ message: 'IdVariante debe ser un número entero' })
  idVariante: number;
}
