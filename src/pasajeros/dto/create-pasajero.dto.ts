import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  Length,
  IsEmail,
  IsInt,
  IsIn,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  MinLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EnumSolicitudPasajero } from 'src/common/estatus.enum';

// Helper function para transformar valores de FormData a números
const toNumber = ({ value }: { value: any }): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
};

export class CreatePasajeroDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre del pasajero' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(1, { message: 'El nombre debe tener al menos 1 carácter' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres' })
  nombre: string;

  @ApiProperty({
    example: 'Pérez',
    description: 'Apellido paterno del pasajero',
  })
  @IsNotEmpty({ message: 'El apellido paterno es obligatorio' })
  @IsString({ message: 'El apellido paterno debe ser una cadena de texto' })
  @MinLength(1, { message: 'El apellido paterno debe tener al menos 1 carácter' })
  @MaxLength(100, { message: 'El apellido paterno no puede exceder los 100 caracteres' })
  apellidoPaterno: string;

  @ApiProperty({
    example: 'García',
    description: 'Apellido materno del pasajero (opcional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  apellidoMaterno?: string;

  @IsNotEmpty({ message: 'La fecha de nacimiento es obligatoria' })
  @IsDateString({}, { message: 'La fecha de nacimiento debe ser una fecha válida en formato ISO 8601' })
  @ApiProperty({
    example: '1995-08-15',
    description: 'Fecha de nacimiento (YYYY-MM-DD)',
    required: true,
  })
  fechaNacimiento: string;

  @ApiProperty({
    example: '5544332211',
    description: 'Teléfono del pasajero (opcional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(1, 15)
  telefono?: string;

  @ApiProperty({
    example: 'juan.perez@example.com',
    description: 'Correo electrónico del pasajero (opcional)',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  @IsNotEmpty()
  correo?: string;

  @IsString()
  @IsNotEmpty({ message: 'El Password es obligatorio' })
  @MinLength(6, { message: 'El Password debe tener al menos 6 caracteres' })
  @Matches(/^(?=.*\p{L})(?=.*\d)(?=.*[@$!%*?&.])[^\s]+$/u, {
    message:
      'El Password debe contener al menos una letra (UTF-8), un número y un símbolo común (@$!%*?&.)',
  })
  @ApiProperty({
    description: 'Contraseña del usuario',
    example: 'P@ssword123',
  })
  passwordHash: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt({ message: 'estatus debe ser un número entero' })
  @IsIn([0, 1], { message: 'Solo puede ser 0 ó 1' })
  @ApiProperty({
    description: 'El estatus es solo 0 ó 1',
    example: 1,
    type: Number,
  })
  estatus?: number = 1;

  @IsNotEmpty({ message: 'El estado de solicitud es obligatorio' })
  @Transform(toNumber)
  @IsEnum(EnumSolicitudPasajero, {
    message: 'Estado de solicitud: 0 (No Solicitado), 1 (SOLICITADO)',
  })
  @ApiProperty({
    description: 'Solicitud cambio tipo de pasajero',
    example: 0,
    type: Number,
    enum: EnumSolicitudPasajero,
  })
  estadoSolicitud: EnumSolicitudPasajero = EnumSolicitudPasajero.NOSOLICITADO;

  @ApiProperty({
    description: 'CURP del pasajero',
    example: 'ABCDEFGHIJKLMNOPQ',
  })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  @MinLength(18)
  curp?: string;

  @ApiProperty({
    example: 'MON-0001',
    description: 'Número de serie único del monedero (opcional). Si no se proporciona, se generará automáticamente un número de serie aleatorio único.',
    required: false,
  })
  @IsString()
  @IsOptional()
  numeroSerieMonedero?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt({ message: 'idTipoPasajero debe ser un número entero' })
  @ApiProperty({
    example: 1,
    description: 'ID del tipo pasajero propietario del monedero',
    type: Number,
  })
  idTipoPasajero?: number;
}
