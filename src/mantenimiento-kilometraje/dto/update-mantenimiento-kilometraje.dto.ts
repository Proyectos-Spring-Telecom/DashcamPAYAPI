import { PartialType } from '@nestjs/swagger';
import { CreateMantenimientoKilometrajeDto } from './create-mantenimiento-kilometraje.dto';

export class UpdateMantenimientoKilometrajeDto extends PartialType(
  CreateMantenimientoKilometrajeDto,
) {}
