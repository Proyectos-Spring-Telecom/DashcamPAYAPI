import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Evidencia del cobro presencial (NetPay Smart SDK). Sin PAN, CVV, track ni PIN.
 */
export class PagoTerminalDto {
  @ApiProperty({ example: 'R-000123456', description: 'Folio de la reserva' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  folio: string;

  @ApiProperty({ description: 'SaleResponse.orderId' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  orderId: string;

  @ApiPropertyOptional({ description: 'SaleResponse.transactionId' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transactionId?: string;

  @ApiPropertyOptional({ description: 'SaleResponse.authCode' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  authCode?: string;

  @ApiPropertyOptional({ description: 'SaleResponse.rrnNumber' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  rrn?: string;

  @ApiProperty({
    example: '100.00',
    description: 'Monto cobrado en la TPV; debe coincidir con el de la reserva',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'montoCobrado debe ser un número con hasta 2 decimales',
  })
  montoCobrado: string;

  @ApiProperty({
    example: 'CREDITO',
    description: 'Naturaleza de la tarjeta usada en la TPV',
  })
  @IsString()
  @IsIn(['CREDITO', 'DEBITO'])
  naturalezaTarjeta: 'CREDITO' | 'DEBITO';

  @ApiPropertyOptional({ description: 'SaleResponse.cardTypeName' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  marca?: string;

  @ApiPropertyOptional({ description: 'BIN (solo primeros dígitos)' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  bin?: string;

  @ApiPropertyOptional({ example: '1234' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  ultimos4?: string;

  @ApiPropertyOptional({ description: 'SaleResponse.transDate' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  fechaTransaccion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  afiliacion?: string;

  @ApiPropertyOptional({ description: 'SaleResponse.moduleTerminal' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  terminal?: string;
}
