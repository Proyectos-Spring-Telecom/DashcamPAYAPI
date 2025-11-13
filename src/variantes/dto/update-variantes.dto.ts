import { PartialType } from '@nestjs/swagger';
import { CreateVariantesDto } from './create-variantes.dto';

export class UpdateVariantesDto extends PartialType(CreateVariantesDto) {}
