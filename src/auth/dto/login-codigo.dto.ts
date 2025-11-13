import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// 🔹 Validador personalizado para codigo
@ValidatorConstraint({ name: 'codigoValidator', async: false })
export class codigoValidator implements ValidatorConstraintInterface {
  validate(codigo: string) {
    // Solo 6 u 8 dígitos numéricos
    if (!/^(\d{6}|\d{8})$/.test(codigo)) return false;

    // No debe ser todos los dígitos iguales (ej. 111111 o 77777777)
    if (/^(\d)\1+$/.test(codigo)) return false;

    // No debe ser consecutivo ascendente ni descendente
    const consecutivoAsc = '0123456789';
    const consecutivoDesc = '9876543210';

    if (consecutivoAsc.includes(codigo)) return false;
    if (consecutivoDesc.includes(codigo)) return false;

    return true;
  }

  defaultMessage() {
    return 'El codigo debe tener exactamente 6 u 8 dígitos, no puede ser consecutivo ni todos iguales';
  }
}

export class LoginAuthCodigoDto {
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
    message: 'El codigo debe tener exactamente 6 u 8 dígitos numéricos',
  })
  @Validate(codigoValidator)
  @ApiProperty({
    description: 'codigo numérico de 6 u 8 dígitos',
    examples: ['482915', '93746281'],
  })
  codigoHash: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Identificador del validadores',
    example: '15aBW',
  })
  validadorId: string;
}
