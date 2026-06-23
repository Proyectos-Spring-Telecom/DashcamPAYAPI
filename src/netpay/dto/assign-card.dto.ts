import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsOptional,
  ValidateNested,
  IsEmail,
  MaxLength,
  IsInt,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DireccionTarjetaDto } from './direccion-tarjeta.dto';

export class AssignCardDto {
  @ApiProperty({
    description: 'ID del cliente (clientId numérico)',
    example: '24665',
  })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({
    description:
      'Token de la tarjeta a asignar (generado por NetpayJS en frontend)',
    example: 'tok_test_1234567890',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    description:
      'Reference ID de la tarjeta (identificador único de la tarjeta guardada en Netpay). Si no se proporciona, se intentará obtener de la respuesta de Netpay.',
    example: '1222337263222',
  })
  @IsString()
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional({
    description: 'Indica si es una pre-autorización',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value === 'true';
    }
    return Boolean(value);
  })
  preAuth?: boolean = false;

  // NOTA: cvv2 NO se acepta en esta API. El CVV se tokeniza SOLO en el cliente con NetpayJS.
  // Si el cliente envía cvv2, será ignorado silenciosamente.

  @ApiPropertyOptional({
    description: 'Nombre del titular de la tarjeta',
    example: 'Juan',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Apellido paterno del titular de la tarjeta',
    example: 'Pérez',
    maxLength: 40,
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  apellidoPaterno?: string;

  @ApiPropertyOptional({
    description: 'Apellido materno del titular de la tarjeta',
    example: 'García',
    maxLength: 40,
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  apellidoMaterno?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico del titular de la tarjeta',
    example: 'juan.perez@example.com',
    maxLength: 100,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({
    description: 'Teléfono del titular de la tarjeta',
    example: '8190034544',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  telefono?: string;

  @ApiPropertyOptional({
    description:
      'ID de la dirección existente a usar (si se proporciona, se usará esta dirección en lugar de crear una nueva)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  idDireccion?: number;

  @ApiPropertyOptional({
    description:
      'Dirección de facturación del titular de la tarjeta (solo si no se proporciona idDireccion)',
    type: DireccionTarjetaDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DireccionTarjetaDto)
  direccion?: DireccionTarjetaDto;
}
