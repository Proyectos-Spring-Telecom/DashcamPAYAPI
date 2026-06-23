import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCatEstatusMantenimientoDto {
  @ApiProperty({
    example: 'En Proceso',
    description: 'Nombre del estatus de mantenimiento.',
    required: true,
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre del estatus de mantenimiento es obligatorio.' })
  @MaxLength(50, { message: 'El nombre no puede exceder los 50 caracteres.' })
  nombre: string;
}

