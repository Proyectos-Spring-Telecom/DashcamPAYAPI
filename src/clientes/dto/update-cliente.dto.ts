import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateClienteDto } from './create-cliente.dto';

/** N-07: no se puede cambiar el padre (tenant) en el PUT. */
export class UpdateClienteDto extends PartialType(
  OmitType(CreateClienteDto, ['idPadre'] as const),
) {}
