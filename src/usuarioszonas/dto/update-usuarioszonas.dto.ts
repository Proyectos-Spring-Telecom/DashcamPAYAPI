import { PartialType } from '@nestjs/swagger';
import { CreateUsuariosZonasDto } from './create-usuarioszonas.dto';

export class UpdateUsuarioszonaDto extends PartialType(CreateUsuariosZonasDto) {}
