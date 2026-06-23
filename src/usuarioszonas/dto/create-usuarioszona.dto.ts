import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateUsuariosZonasDto {
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  @ApiProperty({
    description: 'Estatus de activacion del usuario',
    example: '1',
  })
  estatus: number = 1;

  @ApiProperty({
    example: 101,
    description: 'Id del usuario asociado',
  })
  @IsInt()
  @IsNotEmpty({ message: 'El IdUsuario es obligatorio' })
  idUsuario: number;

  @ApiProperty({
    example: 202,
    description: 'Id de la zona asociada',
  })
  @IsNotEmpty()
  @IsArray()
  @IsNumber({}, { each: true })
  idsZonas: number[];
}

