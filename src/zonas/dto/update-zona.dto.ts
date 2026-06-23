import { PartialType } from '@nestjs/swagger';
import { CreateZonasDto } from './create-zona.dto';

export class UpdateZonaDto extends PartialType(CreateZonasDto) {}
