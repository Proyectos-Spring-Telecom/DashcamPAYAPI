import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index('IX_Viajes_IdTurno_Inicio', ['idTurno','inicio'], {})
@Index('IX_Viajes_IdOperador_Inicio', [ 'idOperador', 'inicio'], {})
@Index('IX_Viajes_IdCliente_Inicio', [ 'idCliente', 'inicio'], {})
@Index('FK_Viajes_Variantes', ['idVariante'], {})
@Index('FK_Viajes_Clientes', ['idCliente'], {})
@Entity('Viajes')
export class Viajes {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('datetime', { name: 'Inicio' })
  inicio: Date;

  @Column('datetime', { name: 'Fin', nullable: true })
  fin: Date | null;

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

  @Column('bigint', { name: 'IdTurno' })
  idTurno: number;

  @Column('bigint', { name: 'IdOperador' })
  idOperador: number;

  @Column('bigint', { name: 'IdVariante' })
  idVariante: number;

}
