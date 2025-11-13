import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// 🔹 Validador personalizado para Codigo
@ValidatorConstraint({ name: 'CodigoValidator', async: false })
export class CodigoValidator implements ValidatorConstraintInterface {
  validate(Codigo: string) {
    // Solo 6 u 8 dígitos numéricos
    if (!/^(\d{6}|\d{8})$/.test(Codigo)) return false;

    // No debe ser todos los dígitos iguales (ej. 111111 o 77777777)
    if (/^(\d)\1+$/.test(Codigo)) return false;

    // No debe ser consecutivo ascendente ni descendente
    const consecutivoAsc = '0123456789';
    const consecutivoDesc = '9876543210';

    if (consecutivoAsc.includes(Codigo)) return false;
    if (consecutivoDesc.includes(Codigo)) return false;

    return true;
  }

  defaultMessage() {
    return 'El Codigo debe tener exactamente 6 u 8 dígitos, no puede ser consecutivo ni todos iguales';
  }
}

export class UpdateUsuarioOperadorDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Usuario',
    example: 'ejemplo@ejemplo.com',
  })
  userName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(\d{6}|\d{8})$/, {
    message: 'El Codigo debe tener exactamente 6 u 8 dígitos numéricos',
  })
  @Validate(CodigoValidator)
  @ApiProperty({
    description: 'Codigo numérico de 6 u 8 dígitos',
    examples: ['482915', '93746281'],
  })
  codigoHash: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Identificador del validador',
    example: '15aBW',
  })
  validadorId: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ description: 'Actualización de Codigo', required: false })
  actualizacionCodigo?: string;
  
}
