import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Clientes } from './Clientes';
import { ConteoPasajeros } from './ConteoPasajeros';
import { InstalacionContadores } from './InstalacionContadores';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('UQ_Contadores_NumeroSerie', ['numeroSerie'], { unique: true })
@Index('UQ_Contadores_IdCliente_Id', ['id', 'idCliente'], { unique: true })
@Index('FK_Contadores_Clientes', ['idCliente'], {})
@Entity('Contadores')
export class Contadores {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'NumeroSerie', unique: true, length: 100 })
  numeroSerie: string;

  @Column('varchar', { name: 'Marca', nullable: true, length: 100 })
  marca: string | null;

  @Column('varchar', { name: 'Modelo', nullable: true, length: 100 })
  modelo: string | null;

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

  @Column('tinyint',{ name: 'EstadoActual', unsigned: true })
  estadoActual: number;

  @Column('bigint', { name: 'IdCliente' })
  idCliente: number;

  @ManyToOne(() => Clientes, (clientes) => clientes.contadores, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdCliente', referencedColumnName: 'id' }])
  idCliente2: Clientes;

  @OneToMany(
    () => ConteoPasajeros,
    (conteoPasajeros) => conteoPasajeros.numeroSerieContador2,
  )
  conteoPasajeros: ConteoPasajeros[];

  @OneToMany(() => InstalacionContadores, (instalacionContadores) => instalacionContadores.contador)
  instalacionContadores: InstalacionContadores[];
}

