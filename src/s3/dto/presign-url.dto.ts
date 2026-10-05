import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class PresignUrlDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  @ApiProperty({
    description: 'URL https del objeto ya guardada en el sistema',
  })
  url: string;
}
