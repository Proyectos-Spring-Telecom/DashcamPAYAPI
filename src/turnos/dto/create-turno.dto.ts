import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateTurnoDto {


  @ApiProperty({
    description: 'Numero de serie del dispositivo.',
    example: 300,
  })
  @IsString()
  @IsNotEmpty()
  numeroSerieValidador: string;

}
