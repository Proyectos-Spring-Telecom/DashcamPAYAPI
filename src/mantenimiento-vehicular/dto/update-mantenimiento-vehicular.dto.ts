import { PartialType } from '@nestjs/swagger';
import { CreateMantenimientoVehicularDto } from './create-mantenimiento-vehicular.dto';

export class UpdateMantenimientoVehicularDto extends PartialType(CreateMantenimientoVehicularDto) {}

