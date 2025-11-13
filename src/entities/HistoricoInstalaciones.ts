import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Entity('HistoricoInstalaciones')
@Index('IDX_HI_IdInstalacion', ['idInstalacion'])
@Index('IDX_HI_IdCliente', ['idCliente'])
@Index('IDX_HI_IdCliente_IdValidador', ['idCliente', 'idValidador'])
@Index('IDX_HI_IdCliente_IdContador', ['idCliente', 'idContador'])
@Index('IDX_HI_IdCliente_IdVehiculo', ['idCliente', 'idVehiculo'])
export class HistoricoInstalaciones {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', name: "Id" })
  id: number;

  @Column({ type: 'bigint', name: "IdInstalacion" })
  idInstalacion: number;

  @Column({ type: 'bigint', name: "IdValidador" })
  idValidador: number;

  @Column({ type: 'bigint', name: "IdContador" })
  idContador: number;

  @Column({ type: 'bigint', name: "IdVehiculo" })
  idVehiculo: number;

  @Column({ type: 'bigint', name: "IdCliente" })
  idCliente: number;

  @CreateDateColumn({ type: 'datetime', name: 'FechaCreacion', default: () => 'CURRENT_TIMESTAMP' })
  fechaCreacion: Date;

  @Column({ type: 'datetime', name: 'FechaBaja', nullable: true, default: null })
  fechaBaja: Date | null;

  @Column({ type: 'text', name: "Comentario", nullable: true })
  comentario?: string | null;

}
