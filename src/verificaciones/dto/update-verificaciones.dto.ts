import { PartialType } from '@nestjs/swagger';
import { CreateVerificacionesDto } from './create-verificaciones.dto';

export class UpdateVerificacionesDto extends PartialType(
  CreateVerificacionesDto,
) {}
