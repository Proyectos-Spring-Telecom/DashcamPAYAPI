import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';

export class TokenizeCardDto {
  @ApiProperty({
    description: 'Número de tarjeta',
    example: '4000000000000002',
  })
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @ApiProperty({
    description: 'Mes de expiración (MM)',
    example: '04',
    minLength: 2,
    maxLength: 2,
  })
  @IsString()
  @IsNotEmpty()
  expMonth: string;

  @ApiProperty({
    description: 'Año de expiración (YY)',
    example: '25',
    minLength: 2,
    maxLength: 2,
  })
  @IsString()
  @IsNotEmpty()
  expYear: string;

  @ApiProperty({
    description: 'Código de seguridad (CVV/CVV2)',
    example: '999',
  })
  @IsString()
  @IsNotEmpty()
  cvv2: string;

  @ApiPropertyOptional({
    description: 'Device Fingerprint generado por NetpayJS (requerido para 3DS 2.0)',
    example: '1721779181755',
  })
  @IsString()
  @IsOptional()
  deviceFingerPrint?: string;

  @ApiPropertyOptional({
    description: 'Indica si se guardará la tarjeta (vault)',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  vault?: boolean;

  @ApiPropertyOptional({
    description: 'true: token de un solo uso, false: token para guardar tarjeta',
    example: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  simpleUse?: boolean;
}
