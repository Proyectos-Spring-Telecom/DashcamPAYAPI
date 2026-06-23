import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class Confirm3DSDto {
  @ApiProperty({
    description:
      'Transaction Token ID de la transacción 3DS (transaccionTokenId)',
    example: 'transaccionTokenId_1234567890',
    required: true,
  })
  @IsString({ message: 'transaccionTokenId must be a string' })
  @IsNotEmpty({ message: 'transaccionTokenId should not be empty' })
  transaccionTokenId: string;

  @ApiProperty({
    description: 'Processor Transaction ID (query parameter)',
    example: 'processorTransactionId',
    required: true,
  })
  @IsString({ message: 'processorTransactionId must be a string' })
  @IsNotEmpty({ message: 'processorTransactionId should not be empty' })
  processorTransactionId: string;
}
