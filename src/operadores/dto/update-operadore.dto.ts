import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOperadoreDto {
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
  @IsOptional()
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

  @IsString()
  @IsOptional({ message: 'Subir foto del operador' })
  @MaxLength(500, {
    message: 'la url de la foto no puede pasar de 500 carecteres.',
  })
  @ApiProperty({
    description: 'Foto de perfil del operador',
    example: 'www.bucket.us.foto.com',
  })
  foto?: string;

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
    description: 'Certificado Medico',
    example: 'Certificado Medico.pdf',
    required: false,
  })
  certificadoMedico?: string;

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

  @IsInt({ message: 'El IdUsuario debe ser un número entero' })
  @ApiProperty({
    description: 'Id del usuario asociado al operador',
    example: 10,
  })
  idUsuario: number;
}
