import { PartialType } from '@nestjs/swagger';
import { CreateTallereDto } from './create-tallere.dto';

export class UpdateTallereDto extends PartialType(CreateTallereDto) {}
