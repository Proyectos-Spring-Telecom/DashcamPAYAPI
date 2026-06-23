import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Variantes } from './Variantes';
import { Zonas } from './Zonas';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_Rutas_Zonas', ['idZona'], {})
@Entity('Rutas')
export class Rutas {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', length: 100 })
  nombre: string;

  @Column('json', { name: 'PuntoInicio', nullable: true })
  puntoInicio: object | null;

  @Column('varchar', { name: 'NombreInicio', length: 200, nullable: true })
  nombreInicio: string | null;

  @Column('json', { name: 'PuntoFin', nullable: true })
  puntoFin: object | null;

  @Column('varchar', { name: 'NombreFin', length: 200, nullable: true })
  nombreFin: string | null;

  @Column('datetime', {
    name: 'FechaCreacion',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion: Date;

  @Column('datetime', {
    name: 'FechaActualizacion',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  fechaActualizacion: Date;

  @Column('tinyint', { name: 'Estatus', default: () => "'1'" })
  estatus: number;

  @Column('bigint', { name: 'IdZona' })
  idZona: number;

  @Column('bigint', { name: 'IdZonaFin', nullable: true })
  idZonaFin: number | null;

  @Column('bigint', { name: 'IdRutaIda', nullable: true })
  idRutaIda: number | null;

  @OneToMany(() => Variantes, (variantes) => variantes.idRuta2)
  variantes: Variantes[];

  @ManyToOne(() => Zonas, (zonas) => zonas.rutas, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdZona', referencedColumnName: 'id' }])
  idZona2: Zonas;

  @ManyToOne(() => Zonas, { nullable: true })
  @JoinColumn([{ name: 'IdZonaFin', referencedColumnName: 'id' }])
  idZonaFin2: Zonas | null;
}
