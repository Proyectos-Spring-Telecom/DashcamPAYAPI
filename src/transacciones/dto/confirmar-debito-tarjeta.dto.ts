import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EnumMetodoPago } from 'src/common/estatus.enum';
import { PagoTerminalDto } from './pago-terminal.dto';

const toNumber = ({ value }: { value: unknown }): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export class ConfirmarDebitoTarjetaDto {
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

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(10)
  @Transform(toNumber)
  cantidadPasajes: number;

  @ApiProperty({
    example: 12.0,
    description: 'Debe coincidir con el monto de la reserva',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Transform(toNumber)
  monto: number;

  @ApiPropertyOptional({ example: 18.953314 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Transform(toNumber)
  latitud?: number;

  @ApiPropertyOptional({ example: -99.235904 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Transform(toNumber)
  longitud?: number;

  @ApiProperty({ example: EnumMetodoPago.TARJETA_TERMINAL })
  @IsEnum(EnumMetodoPago)
  @Transform(toNumber)
  idMetodoPago: EnumMetodoPago;

  @ApiProperty({ type: PagoTerminalDto })
  @ValidateNested()
  @Type(() => PagoTerminalDto)
  @IsNotEmpty()
  pagoTerminal: PagoTerminalDto;
}
