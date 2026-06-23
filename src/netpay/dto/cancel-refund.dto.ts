import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CancelRefundDto {
  @ApiProperty({
    description: 'Transaction Token ID de la transacción a cancelar/reembolsar',
    example: 'tokenId_1234567890',
  })
  @IsString()
  @IsNotEmpty()
  tokenId: string;

  @ApiPropertyOptional({
    description:
      'Monto parcial a reembolsar como string (si no se especifica, se reembolsa el total)',
    example: '500',
  })
  @IsString()
  @IsOptional()
  amount?: string;

  @ApiPropertyOptional({
    description: 'Motivo del reembolso',
    example: 'Promocion',
  })
  @IsString()
  @IsOptional()
  motive?: string;
}
