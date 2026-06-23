import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiPropertyOptional({
    description: 'Token de la tarjeta (para pagos con token nuevo)',
    example: 'tok_test_1234567890',
  })
  @IsString()
  @IsOptional()
  token?: string;

  @ApiProperty({
    description: 'Monto del pago',
    example: 100.5,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    description: 'Moneda (MXN, USD, etc.)',
    example: 'MXN',
    default: 'MXN',
  })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    description: 'Descripción del pago',
    example: 'Pago de servicio de transporte',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'ID del cliente (si se usa token guardado)',
    example: 'cus_1234567890',
  })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'ID de la tarjeta guardada (si se usa token guardado)',
    example: 'card_1234567890',
  })
  @IsString()
  @IsOptional()
  cardId?: string;

  @ApiPropertyOptional({
    description: 'Guardar tarjeta para futuros pagos',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  saveCard?: boolean;

  @ApiPropertyOptional({
    description: 'Reference ID para checkout o tarjeta guardada',
    example: '1222337263222',
  })
  @IsString()
  @IsOptional()
  referenceId?: string;

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
  deviceInformation?: any;

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
}
