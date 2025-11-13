import {
  Entity,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { Transacciones } from './Transacciones';
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Entity('ViajesTransacciones')
export class ViajesTransacciones {
  @PrimaryColumn('bigint', { name: 'IdViaje' })
  idViaje: number;

  @PrimaryColumn('bigint', { name: 'IdTransaccion' })
  idTransaccion: number;

  @JoinColumn([{ name: 'IdTransaccion', referencedColumnName: 'id' }])
  transaccion: Transacciones;
}
