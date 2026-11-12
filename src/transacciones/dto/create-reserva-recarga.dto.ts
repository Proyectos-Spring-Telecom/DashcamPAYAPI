import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EnumMetodoPago } from 'src/common/estatus.enum';

const toNumberDecimal = ({ value }: { value: unknown }): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return Number.isNaN(num) ? undefined : num;
  }
  return undefined;
};

export class CreateReservaRecargaDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  claveIdempotencia: string;

  @ApiProperty({ example: 'MON-670484-5477' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numeroSerieMonedero: string;

  @ApiProperty({ example: 100.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10000)
  @Transform(toNumberDecimal)
  monto: number;

  @ApiProperty({ example: 'a22108bc025bea7f' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numeroSerieValidador: string;

  @ApiProperty({
    example: EnumMetodoPago.TARJETA_TERMINAL,
    description: 'Debe ser 5 (tarjeta presencial TPV)',
    enum: EnumMetodoPago,
  })
  @IsEnum(EnumMetodoPago)
  @Transform(toNumberDecimal)
  idMetodoPago: EnumMetodoPago;
}
