import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsObject,
  Min,
} from 'class-validator';

export class ProcessPaymentWithTokenDto {
  @ApiProperty({
    description: 'Token de la tarjeta generado por NetpayJS',
    example: 'token_q8L5Bf-3yL1y0LQv4EUY7e1vV86WA',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    description: 'Reference ID del checkout (opcional)',
    example: '1222337263222',
  })
  @IsString()
  @IsOptional()
  referenceID?: string;

  @ApiProperty({
    description: 'Monto del pago',
    example: 100.50,
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
    description: 'Device Fingerprint (obtenido de NetpayJS)',
    example: '1721779181755',
  })
  @IsString()
  @IsOptional()
  deviceFingerPrint?: string;

  @ApiPropertyOptional({
    description: 'Device Information (obtenido de NetPay.form.deviceInformation())',
    example: {
      deviceChannel: 'Browser',
      httpBrowserColorDepth: 24,
      httpBrowserJavaEnabled: 'FALSE',
      httpBrowserJavaScriptEnabled: 'TRUE',
      httpBrowserLanguage: 'es',
      httpBrowserScreenHeight: 687,
      httpBrowserScreenWidth: 1718,
      httpBrowserTimeDifference: 360,
    },
  })
  @IsObject()
  @IsOptional()
  deviceInformation?: any;

  @ApiPropertyOptional({
    description: 'Session ID (igual al deviceFingerPrint)',
    example: '1721779181755',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'Guardar tarjeta para futuros pagos (string: "true" o "false")',
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
  @IsObject()
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
