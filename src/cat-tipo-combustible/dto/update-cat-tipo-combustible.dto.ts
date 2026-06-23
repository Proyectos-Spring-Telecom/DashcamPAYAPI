import { PartialType } from '@nestjs/swagger';
import { CreateCatTipoCombustibleDto } from './create-cat-tipo-combustible.dto';

export class UpdateCatTipoCombustibleDto extends PartialType(
  CreateCatTipoCombustibleDto,
) {}
