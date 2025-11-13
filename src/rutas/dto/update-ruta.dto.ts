import { PartialType } from '@nestjs/swagger';
import { CreateRutaDto } from './create-ruta.dto';

export class UpdateRutaDto extends PartialType(CreateRutaDto) {}
