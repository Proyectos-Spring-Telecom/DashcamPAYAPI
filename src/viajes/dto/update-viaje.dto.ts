import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';

export class UpdateViajeDto {
  @IsOptional()
  @IsDateString({}, { message: 'El fin debe ser una fecha en formato ISO' })
  fin?: Date | null;

  @IsOptional()
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  estatus?: number;
}
