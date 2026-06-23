import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Instalaciones } from './Instalaciones';
import { Usuarios } from './Usuarios';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_UsuariosInstalaciones_Usuarios', ['idUsuario'], {})
@Index('FK_UsuariosInstalaciones_Instalaciones', ['idInstalacion'], {})
@Entity('UsuariosInstalaciones')
export class UsuariosInstalaciones {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

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

  @Column('bigint', { name: 'IdUsuario' })
  idUsuario: number;

  @Column('bigint', { name: 'IdInstalacion' })
  idInstalacion: number;

  @ManyToOne(
    () => Instalaciones,
    (instalaciones) => instalaciones.usuariosInstalaciones,
    { onDelete: 'NO ACTION', onUpdate: 'NO ACTION' },
  )
  @JoinColumn([{ name: 'IdInstalacion', referencedColumnName: 'id' }])
  idInstalacion2: Instalaciones;

  @ManyToOne(() => Usuarios, (usuarios) => usuarios.usuariosInstalaciones, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdUsuario', referencedColumnName: 'id' }])
  idUsuario2: Usuarios;
}
