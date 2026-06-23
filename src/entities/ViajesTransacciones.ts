import {
  Column,
  Entity,
  JoinColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { applySchema } from "src/common/apply-schema.decorator";
import { TransaccionesDebito } from './TransaccionesDebito';

@applySchema
@Entity('ViajesTransacciones')
export class ViajesTransacciones {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
    id: number;

  @Column('bigint', { name: 'IdViaje' })
  idViaje: number;

  @Column('bigint', { name: 'IdTransaccionDebito' })
  idTransaccionDebito: number;

  @Column('bigint', { name: 'IdTransaccionRecarga' })
  idTransaccionRecarga: number;

  @JoinColumn([{ name: 'IdTransaccion', referencedColumnName: 'id' }])
  transaccion: TransaccionesDebito;
}
