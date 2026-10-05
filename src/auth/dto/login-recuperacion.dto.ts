import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class LoginAuthResetDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Usuario',
    example: 'ejemplo@ejemplo.com',
  })
  userName: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'OTP de recuperación. Si se envía, no se usa el Bearer como access token.',
    example: '123456',
  })
  codigo?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres' })
  @Matches(/^(?=.*\p{L})(?=.*\d)(?=.*[@$!%*?&.])[^\s]+$/u, {
    message:
      'La contraseña debe contener al menos una letra, un número y un símbolo (@$!%*?&.)',
  })
  @ApiProperty({
    description: 'Contraseña',
    example: 'P@ssword1234',
  })
  password: string;
}
