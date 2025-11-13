import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOperadoreDto {
  @IsString()
  @IsOptional()
  @MaxLength(20, {
    message: 'El número de licencia no puede exceder 20 caracteres',
  })
  @ApiProperty({
    description: 'Número de licencia único del operador',
    example: 'LIC12345678',
  })
  numeroLicencia?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: 'La fecha de nacimiento debe tener formato válido (YYYY-MM-DD)',
    },
  )
  @ApiProperty({
    description: 'Fecha de nacimiento del operador',
    example: '1990-05-15',
  })
  fechaNacimiento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Identificación oficial escaneada',
    example: 'identificacion.pdf',
    required: false,
  })
  identificacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Licencia escaneada',
    example: 'licencia.pdf',
    required: false,
  })
  licencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Comprobante de domicilio',
    example: 'comprobante.pdf',
    required: false,
  })
  comprobanteDomicilio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Antecedentes no penales',
    example: 'antecedentes.pdf',
    required: false,
  })
  antecedentesNoPenales?: string;

  @IsOptional()
  @IsInt({ message: 'Estatus debe ser 0 ó 1' })
  @ApiProperty({
    description: 'Estatus del operador (1=Activo, 0=Inactivo)',
    example: 1,
    required: false,
  })
  estatus?: number = 1;

  @IsOptional()
  @IsInt({ message: 'El IdUsuario debe ser un número entero' })
  @ApiProperty({
    description: 'Id del usuario asociado al operador',
    example: 10,
  })
  idUsuario?: number;
}
