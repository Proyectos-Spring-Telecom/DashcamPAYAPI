import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCatTipoCombustibleDto {
  @ApiProperty({
    example: 'Gasolina Premium',
    description: 'Nombre del tipo de combustible.',
    required: true,
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre del tipo de combustible es obligatorio.' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres.' })
  nombre: string;
}
