import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class PaymentSavedCardDto {
  @ApiProperty({
    description: 'Monto del pago',
    example: 500,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    description: 'Descripción del pago',
    example: 'Cargo de prueba',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Moneda (MXN, USD, etc.)',
    example: 'MXN',
    default: 'MXN',
  })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    description: 'Reference ID de la tarjeta guardada (identifica la tarjeta)',
    example: '1222337263222',
  })
  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @ApiPropertyOptional({
    description:
      'Token de la tarjeta (opcional, puede requerirse junto con referenceID)',
    example: 'token_vzhdS4W-6IAE6KlfGLUXmDH8VIDMFs',
  })
  @IsString()
  @IsOptional()
  token?: string;

  @ApiPropertyOptional({
    description: 'Session ID (igual al deviceFingerPrint)',
    example: '1721779181755',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'Device Fingerprint',
    example: '1721779181755',
  })
  @IsString()
  @IsOptional()
  deviceFingerPrint?: string;

  @ApiPropertyOptional({
    description:
      'Guardar tarjeta para futuros pagos (string: "true" o "false")',
    example: 'false',
    default: 'false',
  })
  @IsString()
  @IsOptional()
  saveCard?: string;

  @ApiPropertyOptional({
    description: 'Datos de facturación del cliente',
    example: {
      firstName: 'Jon',
      lastName: 'Doe',
      email: 'accept@netpay.com.mx',
      phone: '8190034544',
      address: {
        city: 'Monterrey',
        country: 'MX',
        postalCode: '65700',
        state: 'NL',
        street1: 'Filósofos 100',
        street2: 'Tecnologico',
      },
      merchantReferenceCode: 'Folio-unico-de-transaccion-13423',
    },
  })
  @IsOptional()
  billing?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: {
      city?: string;
      country?: string;
      postalCode?: string;
      state?: string;
      street1?: string;
      street2?: string;
    };
    merchantReferenceCode?: string;
  };

  @ApiPropertyOptional({
    description: 'Información del dispositivo (para 3DS) - formato Netpay',
    example: {
      deviceChannel: 'Browser',
      httpBrowserColorDepth: '24',
      httpBrowserJavaEnabled: 'FALSE',
      httpBrowserJavaScriptEnabled: 'TRUE',
      httpBrowserLanguage: 'es',
      httpBrowserScreenHeight: '687',
      httpBrowserScreenWidth: '1718',
      httpBrowserTimeDifference: '360',
    },
  })
  @IsOptional()
  deviceInformation?: {
    deviceChannel?: string;
    httpBrowserColorDepth?: string;
    httpBrowserJavaEnabled?: string;
    httpBrowserJavaScriptEnabled?: string;
    httpBrowserLanguage?: string;
    httpBrowserScreenHeight?: string;
    httpBrowserScreenWidth?: string;
    httpBrowserTimeDifference?: string;
  };
}
