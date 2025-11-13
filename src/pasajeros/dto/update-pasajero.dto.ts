import { PartialType } from '@nestjs/mapped-types';
import { CreatePasajeroDto } from './create-pasajero.dto';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdatePasajeroDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre del pasajero' })
  @IsString()
  @Length(1, 100)
  @IsOptional()
  nombre?: string;

  @ApiProperty({
    example: 'Pérez',
    description: 'Apellido paterno del pasajero',
  })
  @IsString()
  @Length(1, 100)
  @IsOptional()
  apellidoPaterno?: string;

  @ApiProperty({
    example: 'García',
    description: 'Apellido materno del pasajero (opcional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  apellidoMaterno?: string;

  @ApiProperty({
    example: '1995-08-15',
    description: 'Fecha de nacimiento (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  fechaNacimiento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  @ApiProperty({
    description: 'Teléfono',
    example: '5551234567',
    required: false,
  })
  telefono?: string;

  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  @IsOptional()
  @ApiProperty({
    description: 'El estatus es solo 0 ó 1',
    example: '1',
  })
  estatus?: number;
}
