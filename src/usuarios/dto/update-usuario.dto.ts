import {
  IsArray,
  ArrayMaxSize,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUsuarioDto {
  @IsInt()
  @IsOptional()
  @IsIn([0, 1], { message: 'Solo se permite 0 o 1' })
  @ApiProperty({
    description: 'Confirmación de email (0=No, 1=Sí)',
    example: 0,
  })
  emailConfirmado?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({
    description: 'Nombre del usuario',
    example: 'Juan',
    required: false,
  })
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({
    description: 'Apellido paterno',
    example: 'Pérez',
    required: true,
  })
  apellidoPaterno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({
    description: 'Apellido materno',
    example: 'López',
    required: false,
  })
  apellidoMaterno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  @ApiProperty({
    description: 'Teléfono',
    example: '5512345678',
    required: false,
  })
  telefono?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ description: 'Actualización de contraseña', required: false })
  actualizacionPassword?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Foto de perfil', required: false })
  fotoPerfil?: string;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1], { message: 'Solo se permite 0 o 1' })
  @ApiProperty({
    description: 'Estatus del usuario (1=Activo, 0=Inactivo)',
    example: 1,
  })
  estatus?: number = 1;

  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3, 8, 9, 10, 11, 15], {
    message: 'Rol no válido',
  })
  @ApiProperty({ description: 'Rol asignado', example: 2 })
  idRol?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200, { message: 'No se permiten más de 200 permisos' })
  @IsNumber({}, { each: true })
  permisosIds?: number[];
}
