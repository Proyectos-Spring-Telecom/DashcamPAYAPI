import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsInt,
  IsIn,
} from 'class-validator';

export class CreateCatReferenciaServicioDto {
  @ApiProperty({
    example: 'Cambio de Aceite',
    description: 'Nombre de la referencia de servicio.',
    required: true,
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @IsNotEmpty({
    message: 'El nombre de la referencia de servicio es obligatorio.',
  })
  @MaxLength(45, { message: 'El nombre no puede exceder los 45 caracteres.' })
  nombre: string;

  @ApiProperty({
    example: 1,
    description: 'Estatus del registro (1 = activo, 0 = inactivo)',
    required: false,
    default: 1,
  })
  @IsInt({ message: 'El estatus debe ser un número entero.' })
  @IsIn([0, 1], { message: 'El estatus solo puede ser 0 ó 1.' })
  @IsOptional()
  estatus?: number = 1;
}
