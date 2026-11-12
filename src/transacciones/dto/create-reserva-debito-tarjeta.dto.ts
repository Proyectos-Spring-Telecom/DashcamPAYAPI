import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EnumMetodoPago } from 'src/common/estatus.enum';

const toNumber = ({ value }: { value: unknown }): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export class CreateReservaDebitoTarjetaDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  claveIdempotencia: string;

  @ApiProperty({ example: 123 })
  @IsInt()
  @Transform(toNumber)
  idViaje: number;

  @ApiProperty({ example: 'a22108bc025bea7f' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numeroSerieValidador: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  @Transform(toNumber)
  cantidadPasajes: number;

  @ApiProperty({
    example: EnumMetodoPago.TARJETA_TERMINAL,
    description: 'Debe ser 5',
  })
  @IsEnum(EnumMetodoPago)
  @Transform(toNumber)
  idMetodoPago: EnumMetodoPago;
}
