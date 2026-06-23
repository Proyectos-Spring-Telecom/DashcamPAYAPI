import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CheckOutDto {
  @ApiProperty({
    description: 'Reference ID del checkout',
    example: 'ref_1234567890',
  })
  @IsString()
  @IsNotEmpty()
  referenceId: string;
}
