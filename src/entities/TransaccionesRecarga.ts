import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_TransaccionesRecargas_CatTiposTransacciones_idx', ['idTipoTransaccion'], {})
@Index('FK_TransaccionesRecarga_NumeroSerieMonedero_idx', ['numeroSerieMonedero'], {})
@Index('FK_TransaccionesRecarga_NumeroSerieValidador_idx', ['numeroSerieValidador'], {})
@Entity('TransaccionesRecarga')
export class TransaccionesRecarga {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('bigint', { name: 'IdTipoTransaccion' })
  idTipoTransaccion: number;

  @Column('tinyint', { name: 'ControlTransaccion' })
  controlTransaccion: number;

  @Column('decimal', { name: 'Monto', precision: 10, scale: 2 })
  monto: number;

  @Column('decimal', { name: 'LatitudFinal', precision: 10, scale: 7, nullable: true })
  latitudFinal: number | null;

  @Column('decimal', { name: 'LongitudFinal', precision: 10, scale: 7, nullable: true })
  longitudFinal: number | null;

  @Column('datetime', { name: 'FechaHoraFinal' })
  fechaHoraFinal: Date;

  @Column('datetime', {
    name: 'FHRegistro',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fhRegistro: Date;

  @Column('varchar', { name: 'NumeroSerieMonedero', length: 100 })
  numeroSerieMonedero: string;

  @Column('varchar', { name: 'NumeroSerieValidador', length: 100, nullable: true })
  numeroSerieValidador: string | null;

  @Column('bigint', { name: 'IdUsuario', nullable: true })
  idUsuario: number | null;

  @Column('bigint', { name: 'IdMetodoPago', nullable: true })
  idMetodoPago: number | null;

  @Column('varchar', { name: 'TokenCardNetPay', nullable: true, length: 150 })
  tokenCardNetPay: string | null;

  @Column('varchar', { name: 'TransactionTokenIdNetPay', nullable: true, length: 150 })
  transactionTokenIdNetPay: string | null;

  @Column('varchar', { name: 'ReferenceIdNetPay', nullable: true, length: 150 })
  referenceIdNetPay: string | null;

}
