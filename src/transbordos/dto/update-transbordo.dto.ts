import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateTransbordoDto } from './create-transbordo.dto';

/** N-07: el tenant no se mueve en el PATCH. */
export class UpdateTransbordoDto extends PartialType(
  OmitType(CreateTransbordoDto, ['idCliente'] as const),
) {}
