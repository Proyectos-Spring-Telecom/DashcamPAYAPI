import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('FK_HistoricoInstalaciones_Instalaciones', ['idInstalacion'], {})
@Index('FK_HistoricoInstalaciones_Validador', ['idValidador'], {})
@Index('FK_HistoricoInstalaciones_Contador', ['idContador'], {})
@Index('FK_HistoricoInstalaciones_Vehiculo', ['idVehiculo'], {})
@Index('FK_HistoricoInstalaciones_Cliente', ['idCliente'], {})
@Entity('HistoricoInstalaciones')
export class HistoricoInstalaciones {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('bigint', { name: 'IdInstalacion' })
  idInstalacion: number;

  @Column('bigint', { name: 'IdValidador' })
  idValidador: number;

  @Column('bigint', { name: 'IdContador' })
  idContador: number;

  @Column('bigint', { name: 'IdVehiculo' })
  idVehiculo: number;

  @Column('bigint', { name: 'IdCliente' })
  idCliente: number;

  @Column('datetime', {
    name: 'FechaCreacion',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion: Date;

  @Column('datetime', { name: 'FechaBaja', nullable: true })
  fechaBaja: Date | null;

  @Column('text', { name: 'Comentario', nullable: true })
  comentario: string | null;

 
}
