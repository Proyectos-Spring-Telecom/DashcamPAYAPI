import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional } from "class-validator";
import { EstadoComponente } from "src/common/estado-componente.enum";

export class UpdateContadoresEstadoDto {
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
}
