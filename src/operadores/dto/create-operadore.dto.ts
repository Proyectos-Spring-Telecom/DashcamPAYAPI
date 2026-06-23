import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsInt,
  MaxLength,
  IsNumber,
} from 'class-validator';

export class CreateOperadoreDto {
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
  fechaNacimiento: string;

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
  foto: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Licencia escaneada',
    example: 'licencia.pdf',
    required: false,
  })
  licencia?: string;

  @IsString()
  @IsOptional({ message: 'El número de licencia es obligatorio' })
  @MaxLength(20, {
    message: 'El número de licencia no puede exceder 20 caracteres',
  })
  @ApiProperty({
    description: 'Número de licencia único del operador',
    example: 'LIC12345678',
  })
  numeroLicencia?: string;

  @ApiProperty({
    description: 'Fecha en que fue expedida la licencia (YYYY-MM-DD)',
    example: '2023-01-15',
  })
  @IsDateString()
  fechaExpedicion: string;

  @ApiProperty({
    description: 'Fecha de vencimiento de la licencia (YYYY-MM-DD)',
    example: '2026-01-15',
  })
  @IsDateString()
  fechaVencimiento: string;

  @ApiProperty({
    description: 'ID del tipo de licencia',
    example: 2,
  })
  @IsNumber()
  @IsNotEmpty()
  idTipoLicencia: number;

  @ApiProperty({
    description: 'ID de la categoría de licencia',
    example: 4,
  })
  @IsNumber()
  @IsNotEmpty()
  idCategoriaLicencia: number;
}
