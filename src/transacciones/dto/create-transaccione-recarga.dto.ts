import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EnumTipoTransaccion, EnumMetodoPago } from 'src/common/estatus.enum';
import { PagoTerminalDto } from './pago-terminal.dto';

const esTarjetaEcommerce = (o: { idMetodoPago?: number }) =>
  o.idMetodoPago === EnumMetodoPago.TARJETA_CREDITO ||
  o.idMetodoPago === EnumMetodoPago.TARJETA_DEBITO;

const esTarjetaTerminal = (o: { idMetodoPago?: number }) =>
  o.idMetodoPago === EnumMetodoPago.TARJETA_TERMINAL;

// Helper function para transformar valores de FormData a números decimales
const toNumberDecimal = ({ value }: { value: any }): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
};

export class CreateTransaccioneRecargaDto {
  @ApiProperty({
    example: 1,
    description: 'Tipo de transacción: 1 (Recarga), 2 (Debito), 3 (Rechazo)',
    required: false,
  })
  @IsEnum(EnumTipoTransaccion, {
    message:
      'El tipo de transaccion debe ser: 1 (Recarga), 2 (Debito), 3 (Rechazo)',
  })
  @IsOptional()
  @Transform(toNumberDecimal)
  idTipoTransaccion?: EnumTipoTransaccion;

  @ApiProperty({
    example: 150.75,
    description: 'Monto de la transacción (2 decimales)',
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message: 'monto must be a number conforming to the specified constraints',
    },
  )
  @IsPositive({ message: 'El monto debe ser mayor a 0' })
  @Max(10000, { message: 'El monto excede el tope permitido' })
  @IsNotEmpty()
  @Transform(toNumberDecimal)
  monto: number;

  @ApiProperty({
    example: 19.432608,
    description: 'Latitud inicial de la ubicación (opcional)',
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 7 })
  @IsOptional()
  @Transform(toNumberDecimal)
  latitudInicial?: number | null;

  @ApiProperty({
    example: -99.133209,
    description: 'Longitud inicial de la ubicación (opcional)',
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 7 })
  @IsOptional()
  @Transform(toNumberDecimal)
  longitudInicial?: number | null;

  @ApiProperty({
    example: 'MON-0001',
    description: 'Número de serie del monedero',
  })
  @IsString()
  @IsNotEmpty()
  numeroSerieMonedero: string;

  @ApiProperty({
    example: 'DISP-0001',
    description:
      'Número de serie del validador (también acepta numeroSerieDispositivo)',
    required: false,
  })
  @IsString()
  @IsOptional()
  numeroSerieValidador?: string | null;

  @ApiProperty({
    example: 1,
    description:
      'Método: 1 Efectivo, 2 Transferencia, 3/4 Tarjeta e-commerce, 5 Tarjeta presencial TPV',
    enum: EnumMetodoPago,
    required: true,
  })
  @IsEnum(EnumMetodoPago, {
    message:
      'El método de pago debe ser: 1, 2, 3, 4 (e-commerce) o 5 (tarjeta presencial TPV)',
  })
  @IsNotEmpty({ message: 'El método de pago es obligatorio' })
  @Transform(toNumberDecimal)
  idMetodoPago: EnumMetodoPago;

  @ApiPropertyOptional({
    example: 'token_vzhdS4W-6IAE6KlfGLUXmDH8VIDMFs',
    description:
      'Token de la tarjeta de Netpay (obligatorio si método de pago es Tarjeta e-commerce)',
  })
  @ValidateIf(esTarjetaEcommerce)
  @IsString({ message: 'El tokenCardNetPay debe ser una cadena de texto' })
  @IsNotEmpty({
    message:
      'El tokenCardNetPay es obligatorio cuando el método de pago es Tarjeta',
  })
  tokenCardNetPay?: string;

  @ApiPropertyOptional({
    example: 'trans_1234567890',
    description:
      'Transaction Token ID de Netpay (se obtiene de la respuesta de Netpay, no se debe enviar en el request)',
  })
  @ValidateIf(esTarjetaEcommerce)
  @IsString({
    message: 'El transactionTokenIdNetPay debe ser una cadena de texto',
  })
  @IsOptional()
  transactionTokenIdNetPay?: string;

  @ApiPropertyOptional({
    example: '1222337263222',
    description:
      'Reference ID de Netpay (obligatorio si método de pago es Tarjeta e-commerce)',
  })
  @ValidateIf(esTarjetaEcommerce)
  @IsString({ message: 'El referenceIdNetPay debe ser una cadena de texto' })
  @IsNotEmpty({
    message:
      'El referenceIdNetPay es obligatorio cuando el método de pago es Tarjeta',
  })
  referenceIdNetPay?: string;

  @ApiPropertyOptional({
    example: '1721779181755',
    description:
      'Session ID para Netpay (obligatorio si método de pago es Tarjeta e-commerce)',
  })
  @ValidateIf(esTarjetaEcommerce)
  @IsString({ message: 'El sessionId debe ser una cadena de texto' })
  @IsNotEmpty({
    message: 'El sessionId es obligatorio cuando el método de pago es Tarjeta',
  })
  sessionId?: string;

  @ApiPropertyOptional({
    example: '1721779181755',
    description:
      'Device Fingerprint para Netpay (obligatorio si método de pago es Tarjeta e-commerce)',
  })
  @ValidateIf(esTarjetaEcommerce)
  @IsString({ message: 'El deviceFingerPrint debe ser una cadena de texto' })
  @IsNotEmpty({
    message:
      'El deviceFingerPrint es obligatorio cuando el método de pago es Tarjeta',
  })
  deviceFingerPrint?: string;

  @ApiPropertyOptional({
    example: 1,
    description:
      'ID de la dirección guardada en BD (obligatorio si método de pago es Tarjeta e-commerce)',
  })
  @ValidateIf(esTarjetaEcommerce)
  @IsNumber()
  @IsNotEmpty({
    message:
      'El idDireccion es obligatorio cuando el método de pago es Tarjeta',
  })
  @Transform(toNumberDecimal)
  idDireccion?: number;

  @ApiPropertyOptional({
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
    description:
      'Información del dispositivo para Netpay (e-commerce)',
  })
  @ValidateIf(esTarjetaEcommerce)
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

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c',
    description:
      'Llave de idempotencia. Obligatoria si ENFORCE_IDEMPOTENCY_KEY=true o idMetodoPago=5.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  claveIdempotencia?: string;

  @ApiPropertyOptional({
    type: PagoTerminalDto,
    description:
      'Evidencia del cobro presencial. Obligatorio si idMetodoPago = 5.',
  })
  @ValidateIf(esTarjetaTerminal)
  @ValidateNested()
  @Type(() => PagoTerminalDto)
  @IsNotEmpty({
    message: 'pagoTerminal es obligatorio cuando idMetodoPago es 5',
  })
  pagoTerminal?: PagoTerminalDto;
}
