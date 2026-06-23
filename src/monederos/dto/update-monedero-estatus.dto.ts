import { IsIn, IsInt, IsNotEmpty } from 'class-validator';

export class UpdateMonederoEstatusDto {
  @IsNotEmpty({ message: 'Confirmar estatus en valor de 0, 1, 2, 3, 4' })
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1, 2, 3, 4], { message: 'Solo puede ser 0, 1, 2, 3, 4' })
  estatus: number = 1;
}
