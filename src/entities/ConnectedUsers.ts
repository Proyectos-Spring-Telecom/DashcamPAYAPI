import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuarios } from './Usuarios';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Entity('ConnectedUsers')
@Index('IDX_SocketId', ['socketId'])
@Index('IDX_LastActive', ['lastActive'])
@Index('FK_ConnectedUsers_Usuario', ['idUsuario'])
export class ConnectedUsers {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('bigint', { name: 'IdUsuario' })
  idUsuario: number;

  @Column('varchar', { name: 'SocketId', length: 255 })
  socketId: string;

  @Column('datetime', {
    name: 'LastActive',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  lastActive: Date;

  @Column('datetime', {
    name: 'FHRegistro',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fhRegistro: Date;

  @Column('tinyint', { name: 'Estatus', default: () => "'1'" })
  estatus: number;

  @ManyToOne(() => Usuarios, (usuarios) => usuarios.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'IdUsuario', referencedColumnName: 'id' }])
  usuario: Usuarios;
}
