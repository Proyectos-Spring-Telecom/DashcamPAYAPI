import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Viajes } from './Viajes';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_TransaccionesDebito_CatTiposTransacciones_idx', [
  'idTipoTransaccion',
])
@Index('FK_TransaccionesDebito_NumeroSerieMonedero_idx', [
  'numeroSerieMonedero',
])
@Index('FK_TransaccionesDebito_NumeroSerieValidador_idx', [
  'numeroSerieValidador',
])
@Index('FK_TransaccionesDebito_Viajes', ['idViaje'], {})
@Entity('TransaccionesDebito')
export class TransaccionesDebito {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('bigint', { name: 'IdTipoTransaccion' })
  idTipoTransaccion: number;

  @Column('decimal', { name: 'Monto', precision: 10, scale: 2 })
  monto: number;

  @Column('tinyint', { name: 'ControlTransaccion', unsigned: true })
  controlTransaccion: number;

  @Column('decimal', {
    name: 'LatitudInicial',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  latitudInicial: number | null;

  @Column('decimal', {
    name: 'LongitudInicial',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  longitudInicial: number | null;

  @Column('datetime', { name: 'FechaHoraInicio', nullable: true })
  fechaHoraInicio: Date | null;

  @Column('decimal', {
    name: 'DistanciaInicialKm',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  distanciaInicialKm: number | null;

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

  @Column('varchar', { name: 'NumeroSerieValidador', length: 100 })
  numeroSerieValidador: string;

  @Column('int', { name: 'NumeroTransbordo', nullable: true })
  numeroTransbordo: number | null;

  @Column('bigint', { name: 'IdViaje', nullable: true })
  idViaje: number | null;

  @Column('tinyint', { name: 'EsQR', nullable: true, default: 0 })
  esQR: number | null;

  @Column('decimal', {
    name: 'CobroMaximo',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  cobroMaximo: number | null;

  @Column('decimal', {
    name: 'DistanciaRecorrida',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  distanciaRecorrida: number | null;

  @Column('decimal', {
    name: 'DescuentoTransbordo',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  descuentoTransbordo: number | null;

  @Column('bigint', { name: 'TipoDescuentoTransbordo', nullable: true })
  tipoDescuentoTransbordo: number | null;

  @Column('tinyint', { name: 'EsMultiple', nullable: true })
  esMultiple: number | null;

  @ManyToOne(() => Viajes, (viajes) => viajes, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdViaje', referencedColumnName: 'id' }])
  idViaje2: Viajes | null;
}
