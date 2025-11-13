import { ApiProperty } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  IsIn,
  IsEnum,
} from "class-validator";
import { EstadoComponente } from "src/common/estado-componente.enum";

export class CreateContadoresDto {
  @IsString()
  @IsNotEmpty({ message: "El número de serie es obligatorio" })
  @ApiProperty({
    description: "Número de serie único del validador",
    example: "12345-XYZ",
  })
  numeroSerie: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: "Marca del validador",
    example: "BlueTech",
    required: false,
  })
  marca?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: "Modelo del validador",
    example: "2025",
    required: false,
  })
  modelo?: string;

  @IsNotEmpty({ message: "Confirmar estatus en valor de 0 ó 1" })
  @IsInt({ message: "estatus debe ser un número entero" })
  @IsIn([0, 1], { message: "Solo puede ser 0 ó 1" })
  estatus: number = 1;

  @ApiProperty({
    enum: EstadoComponente,
    description: "Estado actual del componente",
    example: EstadoComponente.DISPONIBLE,
  })
  @IsEnum(EstadoComponente, {
    message:
      "estadoActual debe ser un valor válido: " +
      "0 (Inactivo), 1 (Disponible), 2 (Asignado), 3 (En Mantenimiento), 4 (Dañado), 5 (Retirado)",
  })
  @IsOptional()
  estadoActual?: EstadoComponente = EstadoComponente.DISPONIBLE;

  @IsNumber()
  @IsNotEmpty({ message: "El IdCliente es obligatorio" })
  @ApiProperty({
    description: "Identificador del cliente al que pertenece el validador",
    example: "123",
  })
  idCliente: number;
}
