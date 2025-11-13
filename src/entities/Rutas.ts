import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index('FK_Rutas_Zonas', ['idZona'], {})
@Index('FK_Rutas_ZonasFin', ['idZonaFin'], {})
@Entity('Rutas')
export class Rutas {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Nombre', length: 100 })
  nombre: string;

  @Column('json', { name: 'PuntoInicio', nullable: true })
  puntoInicio: object | null;

  @Column('varchar', { name: 'NombreInicio', length: 100, nullable: true })
  nombreInicio: string | null;

  @Column('json', { name: 'PuntoFin', nullable: true })
  puntoFin: object | null;

  @Column('varchar', { name: 'NombreFin', length: 100, nullable: true })
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

  @Column("bigint", { name: "IdZonaFin", nullable: true })
  idZonaFin: number | null;


}
