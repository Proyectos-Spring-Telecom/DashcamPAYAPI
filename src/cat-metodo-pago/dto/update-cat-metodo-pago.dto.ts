import { PartialType } from '@nestjs/swagger';
import { CreateCatMetodoPagoDto } from './create-cat-metodo-pago.dto';

export class UpdateCatMetodoPagoDto extends PartialType(CreateCatMetodoPagoDto) {}
