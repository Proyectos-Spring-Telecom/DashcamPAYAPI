import { ApiProperty, PartialType } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class UpdateContadoresDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: "Número de serie único del validador",
    example: "12345-XYZ",
  })
  numeroSerie?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: "Marca del validador",
    example: "Honor",
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

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: "Identificador del cliente al que pertenece el validador",
    example: "123",
  })
  idCliente?: number;
}
