import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateConteoPasajerosDto {
  @ApiProperty({
    description: 'Número de serie del contador asociado',
    example: 'BVX-2025-XYZ123',
  })
  @IsString()
  @IsNotEmpty()
  numeroSerieContador: string;
}
