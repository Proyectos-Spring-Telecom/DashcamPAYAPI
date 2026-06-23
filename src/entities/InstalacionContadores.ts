import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Instalaciones } from './Instalaciones';
import { Contadores } from './Contadores';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_InstalacionContadores_Instalaciones', ['idInstalacion'], {})
@Index('FK_InstalacionContadores_Contadores', ['idContador'], {})
@Entity('InstalacionContadores')
export class InstalacionContadores {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('bigint', { name: 'IdInstalacion', nullable: true })
  idInstalacion: number | null;

  @Column('bigint', { name: 'IdContador', nullable: true })
  idContador: number | null;

  @Column('datetime', {
    name: 'FHRegistro',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  fhRegistro: Date | null;

  @Column('tinyint', { name: 'Estatus', nullable: true, default: () => "'1'" })
  estatus: number | null;

  @ManyToOne(() => Instalaciones, (instalaciones) => instalaciones.instalacionContadores, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdInstalacion', referencedColumnName: 'id' }])
  instalacion: Instalaciones;

  @ManyToOne(() => Contadores, (contadores) => contadores.instalacionContadores, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdContador', referencedColumnName: 'id' }])
  contador: Contadores;
}

