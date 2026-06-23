import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DatosTarjeta } from './DatosTarjeta';
import { TokenDirecciones } from './TokenDirecciones';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_Datos_Direccion_idx', ['idDatosTarjeta'], {})
@Entity('DireccionesTarjeta')
export class DireccionesTarjeta {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Ciudad', nullable: true, length: 60 })
  ciudad: string | null;

  @Column('varchar', { name: 'Pais', nullable: true, length: 60 })
  pais: string | null;

  @Column('varchar', { name: 'CP', nullable: true, length: 15 })
  cp: string | null;

  @Column('varchar', { name: 'Estado', nullable: true, length: 60 })
  estado: string | null;

  @Column('varchar', { name: 'Calle', nullable: true, length: 60 })
  calle: string | null;

  @Column('varchar', { name: 'CalleEsquina', nullable: true, length: 60 })
  calleEsquina: string | null;

  @Column('varchar', { name: 'Colonia', nullable: true, length: 100 })
  colonia: string | null;

  @Column('tinyint', { name: 'Estatus', nullable: true, default: () => "'1'" })
  estatus: number | null;

  @Column('bigint', { name: 'IdDatosTarjeta', nullable: true })
  idDatosTarjeta: number | null;

  @ManyToOne(() => DatosTarjeta, (datosTarjeta) => datosTarjeta.direccionesTarjeta, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdDatosTarjeta', referencedColumnName: 'id' }])
  idDatosTarjeta2: DatosTarjeta | null;

  @OneToMany(() => TokenDirecciones, (tokenDirecciones) => tokenDirecciones.idDireccion2)
  tokenDirecciones: TokenDirecciones[];
}

