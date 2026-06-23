import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';

export class CheckInDto {
  @ApiProperty({
    description: 'Reference ID del checkout',
    example: 'ref_1234567890',
  })
  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @ApiProperty({
    description: 'Monto del pago',
    example: 100.5,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({
    description: 'Moneda (MXN, USD, etc.)',
    example: 'MXN',
    default: 'MXN',
  })
  @IsString()
  @IsNotEmpty()
  currency?: string = 'MXN';
}
