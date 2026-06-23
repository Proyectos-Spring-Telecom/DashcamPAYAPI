import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateContadoresDto } from './create-contadores.dto';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Identificador del cliente al que pertenece el Contador',
    example: '123',
  })
  idCliente?: number;
}

