import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  Length,
  IsEmail,
  IsInt,
  IsIn,
  IsNotEmpty,
} from 'class-validator';

export class CreatePasajeroDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre del pasajero' })
  @IsString()
  @Length(1, 100)
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({
    example: 'Pérez',
    description: 'Apellido paterno del pasajero',
  })
  @IsString()
  @Length(1, 100)
  @IsNotEmpty()
  apellidoPaterno: string;

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
  fechaNacimiento: string;

  @ApiProperty({
    example: '5544332211',
    description: 'Teléfono del pasajero (opcional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(1, 15)
  telefono?: string;

  @ApiProperty({
    example: 'juan.perez@example.com',
    description: 'Correo electrónico del pasajero (opcional)',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  @IsNotEmpty()
  correo?: string;

  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  @IsOptional()
  @ApiProperty({
    description: 'El estatus es solo 0 ó 1',
    example: '1',
  })
  estatus?: number = 1;
}
