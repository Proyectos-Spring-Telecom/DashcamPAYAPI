import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CodigoPasajeroAutenticacion {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Código OTP de confirmación',
    example: '123456',
  })
  codigo: string;

  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Correo del usuario a verificar.',
    example: 'ejemplo@ejemplo.com',
  })
  userName: string;
}
