import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  EnumControlTransacciones,
  EnumTipoTransaccion,
} from 'src/common/estatus.enum';

export class UpdateTransaccioneDebitoDto {
  @IsEnum(EnumTipoTransaccion, {
    message: 'El tipo de transaccion a realizar: 1 (Recarga), 2 (Debito)',
  })
  @IsOptional()
  idTipoTransaccion?: EnumTipoTransaccion;

  @ApiProperty({
    description: 'Control de la transacción',
    example: `${0} (pagado), ${1} (abierto)`,
    required: false,
  })
  @IsInt()
  @IsOptional()
  controlTransaccion?: EnumControlTransacciones =
    EnumControlTransacciones.PAGADO;

  @ApiProperty({
    example: 19.432608,
    description: 'Latitud de la ubicación (opcional)',
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 7 })
  @IsOptional()
  latitudFinal?: number;

  @ApiProperty({
    example: -99.133209,
    description: 'Longitud de la ubicación (opcional)',
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 7 })
  @IsOptional()
  longitudFinal?: number;

  @ApiProperty({
    example: 'MON-0001',
    description: 'Número de serie del monedero',
  })
  @IsString()
  @IsNotEmpty()
  numeroSerieMonedero: string;

  @ApiProperty({
    example: 'DISP-0001',
    description: 'Número de serie del dispositivo',
  })
  @IsString()
  @IsNotEmpty()
  numeroSerieValidador: string;
}
