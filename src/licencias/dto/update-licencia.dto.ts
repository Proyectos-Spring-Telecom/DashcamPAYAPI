import { PartialType } from '@nestjs/swagger';
import { CreateLicenciaDto } from './create-licencia.dto';

export class UpdateLicenciaDto extends PartialType(CreateLicenciaDto) {}
