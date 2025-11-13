import { ApiProperty } from "@nestjs/swagger";
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class CreateTransaccioneDto {
  @IsIn(["RECARGA", "DEBITO"], {
    message: "Tipo de transacción inválido",
  })
  @ApiProperty({
    description: "Tipo de transaccion",
    example: "RECARGA/DEBITO",
  })
  @IsNotEmpty()
  tipoTransaccion: string;

  @ApiProperty({
    example: 150.75,
    description: "Monto de la transacción (2 decimales)",
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "El monto debe ser un número con máximo 2 decimales" }
  )
  @IsNotEmpty()
  @Min(0, { message: "El monto no puede ser negativo" })
  @Max(99999999.99, {
    message: "El monto máximo permitido es 99,999,999.99",
  })
  monto: number;

  @ApiProperty({
    example: 19.432608,
    description: "Latitud de la ubicación (opcional)",
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 7 })
  @IsOptional()
  latitud?: number;

  @ApiProperty({
    example: -99.133209,
    description: "Longitud de la ubicación (opcional)",
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 7 })
  @IsOptional()
  longitud?: number;

  @ApiProperty({
    example: "2025-09-10T12:30:00Z",
    description: "Fecha y hora de la transacción en formato ISO8601",
  })
  @IsDateString()
  fechaHora: string;

  @ApiProperty({
    example: "MON-0001",
    description: "Número de serie del monedero",
  })
  @IsString()
  @IsNotEmpty()
  numeroSerieMonedero: string;

  @ApiProperty({
    example: "DISP-0001",
    description: "Número de serie del validador",
  })
  @IsString()
  @IsOptional()
  numeroSerieValidador?: string;
}
