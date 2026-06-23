import { PartialType } from '@nestjs/swagger';
import { CreateMantenimientoCombustibleDto } from './create-mantenimiento-combustible.dto';

export class UpdateMantenimientoCombustibleDto extends PartialType(
  CreateMantenimientoCombustibleDto,
) {}
