import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTallereDto {
  @ApiProperty({ example: 'Nombre del taller' })
  @IsString()
  @MaxLength(100)
  nombre: string;

  @ApiProperty({ example: 'Descripción del taller', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @ApiProperty({
    example: 'Url del icono para mostrar en el mapa',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  icono?: string;

  @ApiProperty({ example: 'Av. Reforma 123, CDMX', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @ApiProperty({ example: 19.432608, required: false })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiProperty({ example: 19.432608, required: false })
  @IsOptional()
  lng?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  estatus?: number;

  @ApiProperty({ example: 12, required: false })
  @IsOptional()
  @IsNumber()
  idCliente?: number;
}
