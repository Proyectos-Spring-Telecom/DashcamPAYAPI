import { PartialType } from '@nestjs/mapped-types';
import { CreateValidadorDto } from './create-validador.dto';

export class UpdateValidadorDto extends PartialType(CreateValidadorDto) {}
