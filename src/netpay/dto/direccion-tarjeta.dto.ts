import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class DireccionTarjetaDto {
  @ApiPropertyOptional({
    description: 'Ciudad de la dirección de facturación',
    example: 'Monterrey',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ciudad?: string;

  @ApiPropertyOptional({
    description: 'País de la dirección de facturación (código ISO)',
    example: 'MX',
    maxLength: 60,
    default: 'MX',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  pais?: string = 'MX';

  @ApiPropertyOptional({
    description: 'Código postal de la dirección de facturación',
    example: '65700',
    maxLength: 15,
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  CP?: string;

  @ApiPropertyOptional({
    description: 'Estado de la dirección de facturación',
    example: 'NL',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  estado?: string;

  @ApiPropertyOptional({
    description: 'Calle principal de la dirección de facturación',
    example: 'Filósofos 100',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  calle?: string;

  @ApiPropertyOptional({
    description: 'Calle esquina o referencia de la dirección de facturación',
    example: 'Tecnologico',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  calleEsquina?: string;

  @ApiPropertyOptional({
    description: 'Colonia de la dirección de facturación',
    example: 'El Porvenir',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  colonia?: string;
}

