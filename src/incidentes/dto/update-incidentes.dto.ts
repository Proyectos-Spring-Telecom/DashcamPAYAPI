import { PartialType } from '@nestjs/swagger';
import { CreateIncidentesDto } from './create-incidentes.dto';

export class UpdateIncidentesDto extends PartialType(CreateIncidentesDto) {}
