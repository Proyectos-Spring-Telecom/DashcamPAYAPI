import { PartialType } from '@nestjs/swagger';
import { CreateUsuariosZonasDto } from './create-usuarioszona.dto';

export class UpdateUsuarioszonaDto extends PartialType(CreateUsuariosZonasDto) {}

