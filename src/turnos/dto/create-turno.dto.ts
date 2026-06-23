import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTurnoDto {
  @ApiProperty({
    description: 'Numero de serie del dispositivo.',
    example: 300,
  })
  @IsString()
  @IsNotEmpty()
  numeroSerieValidador: string;
}
