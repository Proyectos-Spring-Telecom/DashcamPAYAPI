import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginAuthDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Usuario',
    example: 'ejemplo@ejemplo.com',
  })
  userName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Contraseña',
    example: 'contraseña1',
  })
  password: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'Serie del validador en el que entra el operador. Si viene, el login lo reasigna a ese equipo.',
    required: false,
  })
  validadorId?: string;
}
