import { PartialType } from '@nestjs/swagger';
import { CreateVarianteDto } from './create-variante.dto';

export class UpdateVarianteDto extends PartialType(CreateVarianteDto) {}
