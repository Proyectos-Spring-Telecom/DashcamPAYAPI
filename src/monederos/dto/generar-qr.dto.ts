import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class GenerarQRDto {
  @ApiProperty({
    example: 3,
    description: 'Número de pasajes para el QR',
    required: true,
  })
  @IsInt({ message: 'numeroPasajes debe ser un número entero' })
  @Min(1, { message: 'numeroPasajes debe ser mayor a 0' })
  @IsNotEmpty({ message: 'numeroPasajes es obligatorio' })
  numeroPasajes: number;
}
