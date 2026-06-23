import { PartialType } from '@nestjs/swagger';
import { CreateCatpasajeroDto } from './create-catpasajero.dto';

export class UpdateCatpasajeroDto extends PartialType(CreateCatpasajeroDto) {}
