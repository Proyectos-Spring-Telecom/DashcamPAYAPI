import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateInstalacionesDto } from './create-instalacione.dto';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// DTO para contadores anteriores
export class ContadorAnteriorDto {
  @ApiProperty({
    description: 'ID del contador que se va a retirar/actualizar',
    example: 5,
  })
  @IsNumber()
  idContador: number;

  @ApiProperty({
    description: 'Estatus anterior del contador (0=Inactivo, 1=Disponible, 2=Asignado, 3=Mantenimiento, 4=Dañado, 5=Retirado)',
    example: 5,
  })
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5], { message: 'Solo se permite 0, 1, 2, 3, 4, 5' })
  estatusAnterior: number;
}

export class UpdateInstalacioneDto extends PartialType(CreateInstalacionesDto) {
  @ApiProperty({
    description: 'ID del validador asociado a la instalación',
    example: 101,
  })
  @IsOptional({ message: 'El IdValidador es obligatorio' })
  @IsNumber()
  idValidador?: number;

  @ApiProperty({
    description: 'Estatus anterior del validador (en caso de reemplazarlo)',
    example: 1,
  })
  @IsOptional({
    message: 'Para saber el estado de los componentes en caso de cambiarlos',
  })
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5], { message: 'Solo se permite 0, 1, 2, 3, 4, 5' })
  estatusValidadorAnterior?: number;

  @ApiProperty({
    description: 'IDs de los contadores asociados a la instalación (nuevos o actuales)',
    example: [8, 10],
    type: [Number],
  })
  @IsOptional({ message: 'Los IdContadores son opcionales' })
  @IsArray({ message: 'IdContadores debe ser un array' })
  @IsNumber({}, { each: true, message: 'Cada IdContador debe ser un número' })
  idContadores?: number[];

  @ApiProperty({
    description: 'Array de contadores anteriores con su ID y estatus anterior',
    example: [
      { idContador: 5, estatusAnterior: 5 },
      { idContador: 7, estatusAnterior: 1 }
    ],
    type: [ContadorAnteriorDto],
  })
  @IsOptional({
    message: 'Para saber el estado de los componentes en caso de cambiarlos',
  })
  @IsArray({ message: 'ContadoresAnteriores debe ser un array' })
  @ValidateNested({ each: true })
  @Type(() => ContadorAnteriorDto)
  contadoresAnteriores?: ContadorAnteriorDto[];

  @ApiProperty({
    description: 'Comentario acerca del validador',
    example: 'Reemplazo por falla',
  })
  @IsString()
  @IsOptional()
  comentariosValidador?: string;

  @ApiProperty({
    description: 'Comentario acerca de los contadores',
    example: 'Se retiraron contadores dañados',
  })
  @IsString()
  @IsOptional()
  comentariosContador?: string;
}
