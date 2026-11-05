import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateContadoresDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Número de serie único del Contador',
    example: 'CNT-12345-XYZ',
  })
  numeroSerie?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Marca del Contador',
    example: 'ContadorTech',
    required: false,
  })
  marca?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Modelo del Contador',
    example: 'CNT-2025',
    required: false,
  })
  modelo?: string;
}
