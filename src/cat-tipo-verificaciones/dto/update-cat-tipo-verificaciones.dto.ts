import { PartialType } from '@nestjs/swagger';
import { CreateCatTipoVerificacionesDto } from './create-cat-tipo-verificaciones.dto';

export class UpdateCatTipoVerificacionesDto extends PartialType(
  CreateCatTipoVerificacionesDto,
) {}
