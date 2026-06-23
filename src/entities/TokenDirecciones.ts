import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DireccionesTarjeta } from './DireccionesTarjeta';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_Token_Direccion_idx', ['idDireccion'], {})
@Entity('TokenDirecciones')
export class TokenDirecciones {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('bigint', { name: 'IdDireccion', nullable: false })
  idDireccion: number;

  @Column('varchar', { name: 'TokenCard', nullable: false, length: 255 })
  tokenCard: string;

  @Column('varchar', { name: 'ReferenceId', nullable: true, length: 255 })
  referenceId: string | null;

  @Column('tinyint', { name: 'Estatus', nullable: false, default: 1 })
  estatus: number;

  @ManyToOne(() => DireccionesTarjeta, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdDireccion', referencedColumnName: 'id' }])
  idDireccion2: DireccionesTarjeta;
}
