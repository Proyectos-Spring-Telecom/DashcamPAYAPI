import { PartialType } from '@nestjs/mapped-types';
import { CreateValidadoresDto } from './create-validadores.dto';

export class UpdateValidadoresDto extends PartialType(CreateValidadoresDto) {}
