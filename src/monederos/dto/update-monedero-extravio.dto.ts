import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  IsNotEmpty,
  IsIn,
} from 'class-validator';

export class UpdateMonederoExtravioDto {
  @ApiProperty({
    example: 'pasajero@contacto.com',
    description: 'El correo electronico',
  })
  @IsString()
  correo: string;

  @ApiProperty({
    example: 'MON-001A',
    description: 'El nuevo numero de serie del monedero',
  })
  @IsString()
  numeroSerie: string;


}