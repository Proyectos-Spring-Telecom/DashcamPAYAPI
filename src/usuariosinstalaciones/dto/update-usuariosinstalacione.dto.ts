import { PartialType } from '@nestjs/swagger';
import { CreateUsuariosInstalacionesDto } from './create-usuariosinstalacione.dto';

export class UpdateUsuariosinstalacioneDto extends PartialType(CreateUsuariosInstalacionesDto) {}
