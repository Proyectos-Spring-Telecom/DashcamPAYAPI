import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('UQ_TransaccionesRecarga_ClaveIdempotencia', ['claveIdempotencia'], {
  unique: true,
})
@Index(
  'FK_TransaccionesRecargas_CatTiposTransacciones_idx',
  ['idTipoTransaccion'],
  {},
)
@Index(
  'FK_TransaccionesRecarga_NumeroSerieMonedero_idx',
  ['numeroSerieMonedero'],
  {},
)
@Index(
  'FK_TransaccionesRecarga_NumeroSerieValidador_idx',
  ['numeroSerieValidador'],
  {},
)
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

  @Column('decimal', {
    name: 'MontoReembolsado',
    precision: 10,
    scale: 2,
    default: () => "'0.00'",
  })
  montoReembolsado: number;

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

  @Column('varchar', {
    name: 'TransactionTokenIdNetPay',
    nullable: true,
    length: 150,
  })
  transactionTokenIdNetPay: string | null;

  @Column('varchar', { name: 'ReferenceIdNetPay', nullable: true, length: 150 })
  referenceIdNetPay: string | null;

  @Column('varchar', {
    name: 'ClaveIdempotencia',
    length: 100,
    nullable: true,
  })
  claveIdempotencia: string | null;

  @Column('varchar', { name: 'OrderIdNetPay', nullable: true, length: 100 })
  orderIdNetPay: string | null;

  @Column('varchar', {
    name: 'TransactionIdNetPay',
    nullable: true,
    length: 100,
  })
  transactionIdNetPay: string | null;

  @Column('varchar', { name: 'AuthCodeNetPay', nullable: true, length: 50 })
  authCodeNetPay: string | null;

  @Column('varchar', { name: 'RrnNetPay', nullable: true, length: 50 })
  rrnNetPay: string | null;

  @Column('varchar', { name: 'NaturalezaTarjeta', nullable: true, length: 20 })
  naturalezaTarjeta: string | null;

  @Column('varchar', { name: 'Bin', nullable: true, length: 8 })
  bin: string | null;

  @Column('varchar', { name: 'Ultimos4', nullable: true, length: 4 })
  ultimos4: string | null;

  @Column('varchar', { name: 'FolioNetPay', nullable: true, length: 20 })
  folioNetPay: string | null;

  @Column('varchar', { name: 'MarcaTarjeta', nullable: true, length: 50 })
  marcaTarjeta: string | null;

  @Column('varchar', { name: 'StoreIdNetPay', nullable: true, length: 50 })
  storeIdNetPay: string | null;

  @Column('varchar', { name: 'AfiliacionNetPay', nullable: true, length: 50 })
  afiliacionNetPay: string | null;

  @Column('varchar', { name: 'TerminalNetPay', nullable: true, length: 50 })
  terminalNetPay: string | null;
}
