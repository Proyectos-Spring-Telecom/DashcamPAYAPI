import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_HistTransRec_NumeroSerieMonedero_idx', ['numeroSerieMonedero'], {})
@Index('FK_HistTransRec_NumeroSerieValidador_idx', ['numeroSerieValidador'], {})
@Index('FK_HistTransRec_CatTiposTransacciones_idx', ['idTipoTransaccion'], {})
@Entity('HistoricoTransaccionesRecarga')
export class HistoricoTransaccionesRecarga {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('bigint', { name: 'IdTipoTransaccion' })
  idTipoTransaccion: number;

  @Column('varchar', { name: 'ControlTransaccion', nullable: true, length: 30 })
  controlTransaccion: string | null;

  @Column('decimal', { name: 'Monto', precision: 10, scale: 2 })
  monto: number;

  @Column('decimal', {
    name: 'LatitudFinal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  latitudFinal: number | null;

  @Column('decimal', {
    name: 'LongitudFinal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
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

  @Column('varchar', {
    name: 'NumeroSerieValidador',
    length: 100,
    nullable: true,
  })
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

  // -------- RELACIONES --------

}
