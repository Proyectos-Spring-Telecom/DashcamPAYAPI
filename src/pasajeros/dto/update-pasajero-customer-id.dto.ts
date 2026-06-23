import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdatePasajeroCustomerIdDto {
  @ApiProperty({
    description: 'Customer ID de Netpay',
    example: 'EhRucCFcuZ6ynOe9x0T=gdmc_Gp!5Z',
  })
  @IsString()
  @IsNotEmpty({ message: 'El CustomerIdNetPay es obligatorio' })
  customerIdNetPay: string;
}
