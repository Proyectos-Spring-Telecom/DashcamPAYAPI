import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCatTipoVerificacionesDto {
  @ApiProperty({
    example: 'Verificación Técnica',
    description: 'Nombre del tipo de verificación.',
    required: true,
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre del tipo de verificación es obligatorio.' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres.' })
  nombre: string;
}
