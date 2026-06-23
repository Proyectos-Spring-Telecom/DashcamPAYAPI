import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Contadores } from './Contadores';
import { Viajes } from './Viajes';
import { ViajesConteos } from './ViajesConteos';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index(
  'IX_ConteoPasajeros_Serie_FechaHora',
  ['fechaHora', 'numeroSerieContador'],
  {},
)
@Entity('ConteoPasajeros')
export class ConteoPasajeros {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('int', { name: 'Entradas', nullable: true, default: () => "'0'" })
  entradas: number | null;

  @Column('int', { name: 'Salidas', nullable: true, default: () => "'0'" })
  salidas: number | null;

  @Column('int', { name: 'Diferencia' })
  diferencia: number;

  @Column('datetime', { name: 'FechaHora' })
  fechaHora: Date;

  @Column('datetime', {
    name: 'FHRegistro',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fhRegistro: Date;

  @Column('varchar', { name: 'NumeroSerieContador', length: 100 })
  numeroSerieContador: string;

  @Column('bigint', { name: 'IdViaje', nullable: true })
  idViaje: number | null;

  @Column('tinyint', { name: 'Estatus', nullable: true, default: () => "'1'" })
  estatus: number | null;

  @ManyToOne(() => Contadores, (contadores) => contadores.conteoPasajeros, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([
    { name: 'NumeroSerieContador', referencedColumnName: 'numeroSerie' },
  ])
  numeroSerieContador2: Contadores;

  @ManyToOne(() => Viajes, (viajes) => viajes.conteoPasajerosDirectos, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
    nullable: true,
  })
  @JoinColumn([{ name: 'IdViaje', referencedColumnName: 'id' }])
  idViaje2: Viajes | null;

  @ManyToMany(() => Viajes, (viajes) => viajes.conteoPasajeros)
  @JoinTable({
    name: 'ViajesConteos',
    joinColumns: [{ name: 'IdConteo', referencedColumnName: 'id' }],
    inverseJoinColumns: [{ name: 'IdViaje', referencedColumnName: 'id' }],
    schema: 'DashCamDev',
  })
  viajes: Viajes[];
}
