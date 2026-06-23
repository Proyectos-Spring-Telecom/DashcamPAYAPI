import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Clientes } from './Clientes';
import { Pasajeros } from './Pasajeros';
import { applySchema } from 'src/common/apply-schema.decorator';
import { CatTiposPasajeros } from './CatTiposPasajeros';

@applySchema
@Index('UQ_Monederos_NumeroSerie', ['numeroSerie'], { unique: true })
@Index('FK_Monederos_Pasajeros', ['idPasajero'], {})
@Index('FK_Monederos_Clientes', ['idCliente'], {})
@Entity('Monederos')
export class Monederos {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'NumeroSerie', unique: true, length: 100 })
  numeroSerie: string;

  @Column('decimal', {
    name: 'Saldo',
    precision: 10,
    scale: 2,
    default: () => "'0.00'",
  })
  saldo: number;

  @Column('datetime', { name: 'FechaActivacion' })
  fechaActivacion: Date;

  @Column('datetime', {
    name: 'FechaCreacion',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion: Date;

  @Column('datetime', {
    name: 'FechaActualizacion',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaActualizacion: Date;

  @Column('tinyint', { name: 'Estatus', default: () => "'1'" })
  estatus: number;

  @Column('bigint', { name: 'IdPasajero', nullable: true })
  idPasajero: number | null;

  @Column('bigint', { name: 'IdCliente' })
  idCliente: number;

  @Column('bigint', { name: 'IdTipoPasajero' })
  idTipoPasajero: number;

  @Column('tinyint', { name: 'EsVirtual', default: () => "'0'" })
  esVirtual: number;

  @Column('varchar', { name: 'IdCard', nullable: true, length: 100 })
  idCard: string | null;

  @ManyToOne(() => Clientes, (clientes) => clientes.monederos, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdCliente', referencedColumnName: 'id' }])
  idCliente2: Clientes;

  @ManyToOne(() => Pasajeros, (pasajeros) => pasajeros.monederos, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdPasajero', referencedColumnName: 'id' }])
  idPasajero2: Pasajeros;

  @ManyToOne(() => CatTiposPasajeros, (tipoPasajero) => tipoPasajero.Monederos)
  @JoinColumn({ name: 'IdTipoPasajero' })
  TipoPasajero: CatTiposPasajeros;
}
