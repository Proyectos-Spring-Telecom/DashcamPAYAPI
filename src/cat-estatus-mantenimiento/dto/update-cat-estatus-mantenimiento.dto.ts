import { PartialType } from '@nestjs/swagger';
import { CreateCatEstatusMantenimientoDto } from './create-cat-estatus-mantenimiento.dto';

export class UpdateCatEstatusMantenimientoDto extends PartialType(CreateCatEstatusMantenimientoDto) {}

