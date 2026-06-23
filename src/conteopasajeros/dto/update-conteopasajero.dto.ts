import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateConteoPasajerosDto {
  @ApiProperty({
    description: 'Número de serie del contador asociado',
    example: 'BVX-2025-XYZ123',
  })
  @IsString()
  @IsNotEmpty()
  numeroSerieContador: string;

  @ApiProperty({
    description: 'Indica si es una subida (true) o bajada (false)',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  esSubida?: boolean;

  @ApiProperty({
    description: 'Número de subidas a agregar',
    example: 5,
    required: false,
  })
  @IsInt()
  @IsOptional()
  subidas?: number;

  @ApiProperty({
    description: 'Número de bajadas a agregar',
    example: 3,
    required: false,
  })
  @IsInt()
  @IsOptional()
  bajadas?: number;
}
