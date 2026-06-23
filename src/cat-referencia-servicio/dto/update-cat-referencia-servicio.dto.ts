import { PartialType } from '@nestjs/swagger';
import { CreateCatReferenciaServicioDto } from './create-cat-referencia-servicio.dto';

export class UpdateCatReferenciaServicioDto extends PartialType(
  CreateCatReferenciaServicioDto,
) {}
