import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EnumTipoDescuento } from 'src/common/estatus.enum';

export class CreateCatpasajeroDto {
  @ApiProperty({
    example: 'Estudiante',
    description: 'Nombre del tipo de pasajero.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre: string;

  @ApiProperty({
    enum: EnumTipoDescuento,
    example: 1,
    description:
      'Tipo de descuento: puede ser 1=Porcentaje, 2=Cantidad fija, etc.',
  })
  @IsEnum(EnumTipoDescuento, {
    message: 'Tipo Descuento 1 (Porcentaje), 2 (Monetario), 3(Nulo)',
  })
  idCatTipoDescuento: EnumTipoDescuento = EnumTipoDescuento.NULO;

  @ApiProperty({
    example: 50,
    description: 'Cantidad asociada al descuento. Puede ser nula.',
    required: false,
  })
  @IsOptional()
  @IsInt()
  cantidad?: number | null;

  @IsNotEmpty({ message: 'Confirmar estatus en valor de 0 ó 1' })
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  estatus: number = 1;

  @ApiProperty({
    example: 1,
    description: 'Id del cliente propietario de este tipo de pasajero.',
  })
  @IsInt()
  idCliente: number;
}
