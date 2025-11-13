import { PartialType } from '@nestjs/swagger';
import { CreateZonasDto } from './create-zonas.dto';

export class UpdateZonasDto extends PartialType(CreateZonasDto) {}
