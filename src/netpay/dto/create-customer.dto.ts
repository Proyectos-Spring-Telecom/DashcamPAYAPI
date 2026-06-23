import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsNotEmpty,
  IsString,
  IsEmail,
  IsOptional,
  IsInt,
} from 'class-validator';

/**
 * Campos que el front a veces envía pero no aplican a crear customer en Netpay.
 * Se permiten con @Allow() para no fallar con forbidNonWhitelisted; el servicio los ignora.
 */
export class CreateCustomerDto {
  @ApiProperty({
    description:
      'Nombre del cliente (Netpay). El body puede enviar `nombre`; un interceptor lo copia a firstName antes de validar.',
    example: 'Juan',
  })
  @IsString({ message: 'firstName must be a string' })
  @IsNotEmpty({ message: 'firstName should not be empty' })
  firstName: string;

  @ApiProperty({
    description:
      'Apellido(s) del cliente (Netpay). El body puede enviar `apellidoPaterno`/`apellidoMaterno`; un interceptor arma lastName antes de validar.',
    example: 'Pérez',
  })
  @IsString({ message: 'lastName must be a string' })
  @IsNotEmpty({ message: 'lastName should not be empty' })
  lastName: string;

  @ApiProperty({
    description: 'Correo electrónico del cliente',
    example: 'juan.perez@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({
    description:
      'Teléfono del cliente. El body puede enviar `telefono`; un interceptor lo copia a phone antes de validar.',
    example: '+521234567890',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  /** Ignorados por createCustomer; permitidos para compatibilidad con payloads del front */
  @Allow()
  @IsOptional()
  preAuth?: unknown;

  @Allow()
  @IsOptional()
  nombre?: unknown;

  @Allow()
  @IsOptional()
  apellidoPaterno?: unknown;

  @Allow()
  @IsOptional()
  apellidoMaterno?: unknown;

  @Allow()
  @IsOptional()
  telefono?: unknown;

  @Allow()
  @IsOptional()
  idDireccion?: unknown;

  @Allow()
  @IsOptional()
  direccion?: unknown;

  @ApiPropertyOptional({
    description:
      'Reference ID de la tarjeta en Netpay (opcional al asignar token tras crear el customer)',
    example: '1222337263222',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({
    description:
      'Token de tarjeta a asignar al cliente (se asignará después de crear el cliente)',
    example: 'tok_test_1234567890',
  })
  @IsString()
  @IsOptional()
  token?: string;

  @ApiPropertyOptional({
    description:
      'Identificador único del cliente en tu sistema. Si no se proporciona, se generará automáticamente un número aleatorio de 10 dígitos.',
    example: '1234567890',
  })
  @IsString()
  @IsOptional()
  identifier?: string;

  @ApiPropertyOptional({
    description:
      'ID del pasajero al que se asociará el customerIdNetPay después de crear el customer',
    example: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt({ message: 'El idPasajero debe ser un número entero' })
  idPasajero?: number;
}
