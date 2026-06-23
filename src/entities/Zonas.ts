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
import { Rutas } from './Rutas';
import { UsuariosZonas } from './UsuariosZonas';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_Zonas_Clientes', ['idCliente'], {})
@Entity('Zonas')
export class Zonas {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', length: 100 })
  nombre: string;

  @Column('varchar', { name: 'Descripcion', nullable: true, length: 255 })
  descripcion: string | null;

  @Column('json', { name: 'Geocerca', nullable: true })
  geocerca: object | null;

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

  @Column('bigint', { name: 'IdCliente' })
  idCliente: number;

  @ManyToOne(() => Clientes, (clientes) => clientes.zonas, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdCliente', referencedColumnName: 'id' }])
  idCliente2: Clientes;

  @OneToMany(() => Rutas, (rutas) => rutas.idZona2)
  rutas: Rutas[];

  @OneToMany(() => UsuariosZonas, (usuariosZonas) => usuariosZonas.idZona2)
  usuariosZonas: UsuariosZonas[];
}
