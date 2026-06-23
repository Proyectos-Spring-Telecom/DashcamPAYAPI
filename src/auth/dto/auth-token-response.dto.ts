import { ApiProperty } from '@nestjs/swagger';

export class AuthTokenPairResponseDto {
  @ApiProperty({
    description: 'Access token JWT (corta duración, ~15 min)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token: string;

  @ApiProperty({
    description: 'Refresh token para renovar el access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: 'Sesión cerrada correctamente' })
  message: string;
}
