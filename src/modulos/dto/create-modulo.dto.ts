import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateModuloDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100, {
    message: 'El nombre no puede exceder 100 caracteres',
  })
  @ApiProperty({
    description: 'Nombre del módulo (máx. 100 caracteres)',
    example: 'Módulos',
    maxLength: 100,
  })
  nombre: string;

  @IsString()
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  @MaxLength(255, {
    message: 'La descripción no puede exceder 255 caracteres',
  })
  @ApiProperty({
    description: 'Descripción del módulo (máx. 255 caracteres)',
    example: 'Módulo',
    maxLength: 255,
  })
  descripcion: string;

  @IsInt({ message: 'Estatus debe ser un numero entero' })
  @IsIn([0, 1], { message: 'Estatus solo puede ser 0 ó 1' })
  @IsOptional()
  @ApiProperty({
    description: 'Estatus del validador solo es 1 ó 0',
    example: '1',
  })
  estatus?: number = 1;
}
