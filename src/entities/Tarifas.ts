import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Variantes } from './Variantes';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_Tarifas_Variantes', ['idVariante'], {})
@Entity('Tarifas')
export class Tarifas {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('decimal', { name: 'TarifaBase', precision: 10, scale: 2 })
  tarifaBase: number;

  @Column('decimal', {
    name: 'DistanciaBaseKm',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  distanciaBaseKm: number;

  @Column('int', { name: 'IncrementoCadaMetros', nullable: true })
  incrementoCadaMetros: number;

  @Column('decimal', {
    name: 'CostoAdicional',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  costoAdicional: number;

  @Column('decimal', {
    name: 'CostoPorEstacion',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  costoPorEstacion: number | null;

  @Column('int', { name: 'CantidadEstacionesBase', nullable: true })
  cantidadEstacionesBase: number | null;

  @Column('int', { name: 'TipoTarifa', unsigned: true })
  tipoTarifa: number;

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

  @Column('bigint', { name: 'IdVariante' })
  idVariante: number;

  @ManyToOne(() => Variantes, (variantes) => variantes.tarifas, {
    onDelete: 'CASCADE',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdVariante', referencedColumnName: 'id' }])
  idVariante2: Variantes;
}
