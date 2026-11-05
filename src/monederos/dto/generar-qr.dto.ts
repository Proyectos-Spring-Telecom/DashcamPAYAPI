import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';

export class GenerarQRDto {
  @ApiProperty({
    example: 3,
    description: 'Número de pasajes para el QR',
    required: true,
  })
  @IsInt({ message: 'numeroPasajes debe ser un número entero' })
  @Min(1, { message: 'numeroPasajes debe ser mayor a 0' })
  @Max(50, { message: 'numeroPasajes no puede ser mayor a 50' })
  @IsNotEmpty({ message: 'numeroPasajes es obligatorio' })
  numeroPasajes: number;
}
