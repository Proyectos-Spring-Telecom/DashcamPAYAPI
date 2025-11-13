import { ApiProperty, PartialType } from "@nestjs/swagger";
import { CreateInstalacionesDto } from "./create-instalacione.dto";
import { IsIn, IsInt, IsNumber, IsOptional, IsString } from "class-validator";

export class UpdateInstalacioneDto extends PartialType(CreateInstalacionesDto) {
  @ApiProperty({
    description: "ID del validador asignado a la instalación",
    example: 1,
  })
  @IsNumber()
  @IsOptional({ message: "ID del validador asignado a la instalación" })
  idValidador?: number;

  @ApiProperty({
    description:
      "Estatus del validador asignado a la instalación anteriormente",
    example: 1,
  })
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5], { message: "Solo se permite 0, 1, 2, 3, 4, 5" })
  @IsOptional({
    message: "Estatus del validador asignado a la instalación anteriormente",
  })
  estatusValidadorAnterior?: number;

  @ApiProperty({
    description: "ID del contador asignado a la instalación",
    example: 2,
  })
  @IsNumber()
  @IsOptional({ message: "ID del contador asignado a la instalación" })
  idContador?: number;

  @ApiProperty({
    description: "Estatus del contador asignado a la instalación anteriormente",
    example: 1,
  })
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5], { message: "Solo se permite 0, 1, 2, 3, 4, 5" })
  @IsOptional({
    message: "Estatus del contador asignado a la instalación anteriormente",
  })
  estatusContadorAnterior?: number;

  @ApiProperty({
    description: "Comentario acerca de los componentes",
    example: 404,
  })
  @IsString()
  @IsOptional({ message: "Comentario del cambio del componente" })
  comentariosValidador?: string;

  @ApiProperty({
    description: "Comentario acerca de los componentes",
    example: 404,
  })
  @IsString()
  @IsOptional({ message: "Comentario del cambio del componente" })
  comentariosContador?: string;
}
