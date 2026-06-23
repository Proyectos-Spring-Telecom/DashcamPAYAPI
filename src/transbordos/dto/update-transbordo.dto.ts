import { PartialType } from '@nestjs/swagger';
import { CreateTransbordoDto } from './create-transbordo.dto';

export class UpdateTransbordoDto extends PartialType(CreateTransbordoDto) {}

