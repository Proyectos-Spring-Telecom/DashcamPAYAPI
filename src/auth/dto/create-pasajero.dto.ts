import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsNumber,
  ValidateIf,
} from 'class-validator';
import { EnumSolicitudPasajero } from 'src/common/estatus.enum';

export class CreateAltaPasajaroDto {
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(1, { message: 'El nombre debe tener al menos 1 carácter' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres' })
  @ApiProperty({
    description: 'Nombre del usuario',
    example: 'Juan',
    required: true,
  })
  nombre: string;

  @IsNotEmpty({ message: 'El apellido paterno es obligatorio' })
  @IsString({ message: 'El apellido paterno debe ser una cadena de texto' })
  @MinLength(1, {
    message: 'El apellido paterno debe tener al menos 1 carácter',
  })
  @MaxLength(100, {
    message: 'El apellido paterno no puede exceder los 100 caracteres',
  })
  @ApiProperty({
    description: 'Apellido paterno',
    example: 'Pérez',
    required: true,
  })
  apellidoPaterno: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({
    description: 'Apellido materno',
    example: 'López',
    required: false,
  })
  apellidoMaterno?: string;

  @IsNotEmpty({ message: 'La fecha de nacimiento es obligatoria' })
  @IsDateString(
    {},
    {
      message:
        'La fecha de nacimiento debe ser una fecha válida en formato ISO 8601',
    },
  )
  @ApiProperty({
    example: '1995-08-15',
    description: 'Fecha de nacimiento (YYYY-MM-DD)',
    required: true,
  })
  fechaNacimiento: string;

  @IsString()
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  @IsEmail()
  @MaxLength(100, {
    message: 'El UserName no puede exceder los 100 caracteres',
  })
  @ApiProperty({ description: 'Nombre de usuario', example: 'usuario01' })
  correo: string;

  @IsString()
  @IsNotEmpty({ message: 'El Password es obligatorio' })
  @MinLength(12, { message: 'El Password debe tener al menos 12 caracteres' })
  @Matches(/^(?=.*\p{L})(?=.*\d)(?=.*[@$!%*?&.])[^\s]+$/u, {
    message:
      'El Password debe contener al menos una letra (UTF-8), un número y un símbolo común (@$!%*?&.)',
  })
  @ApiProperty({
    description: 'Contraseña del usuario',
    example: 'P@ssword123',
  })
  passwordHash: string;

  @IsEnum(EnumSolicitudPasajero, {
    message: 'Estado de solicitud: 0 (No Solicitado), 1 (SOLICITADO)',
  })
  @ApiProperty({
    description: 'Solicitud cambio tipo de pasajero',
    example: '0 = No Solicitado, 1 = Solicitado',
  })
  @IsNotEmpty()
  estadoSolicitud: EnumSolicitudPasajero = EnumSolicitudPasajero.NOSOLICITADO;

  @ApiProperty({
    description: 'url del documento',
    example: 'https.documento.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentacion?: string;

  @ApiProperty({
    example: 'MON-0001',
    description: 'Número de serie único del monedero',
    required: false,
  })
  @IsOptional()
  @IsString()
  numeroSerieMonedero?: string;

  @ValidateIf((o) => !o.numeroSerieMonedero)
  @IsNotEmpty({
    message:
      'El idCliente es obligatorio cuando no se proporciona numeroSerieMonedero',
  })
  @IsNumber({}, { message: 'El idCliente debe ser un número' })
  @ApiProperty({
    description:
      'ID del cliente. Obligatorio si no se proporciona numeroSerieMonedero. Si se proporciona numeroSerieMonedero, se obtendrá automáticamente del monedero.',
    example: 1,
    required: false,
  })
  idCliente?: number;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  @ApiProperty({
    description: 'Teléfono',
    example: '5512345678',
    required: false,
  })
  telefono?: string;

  @ApiProperty({
    description: 'CURP del pasajero',
    example: 'ABCDEFGHIJKLMNOPQ',
  })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  @MinLength(18)
  curp?: string;
}
