import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Clientes } from './Clientes';
import { Variantes } from './Variantes';
import { Operadores } from './Operadores';
import { Turnos } from './Turnos';
import { ConteoPasajeros } from './ConteoPasajeros';
import { ViajesConteos } from './ViajesConteos';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('IX_Viajes_IdTurno_Inicio', ['inicio', 'idTurno'], {})
@Index('IX_Viajes_IdOperador_Inicio', ['inicio', 'idOperador'], {})
@Index('IX_Viajes_IdCliente_Inicio', ['inicio', 'idCliente'], {})
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

  @ManyToOne(() => Clientes, (clientes) => clientes.viajes, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdCliente', referencedColumnName: 'id' }])
  idCliente2: Clientes;

  @ManyToOne(() => Variantes, (variantes) => variantes.viajes, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdVariante', referencedColumnName: 'id' }])
  idVariante2: Variantes;

  @ManyToOne(() => Operadores, (operadores) => operadores.viajes, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdOperador', referencedColumnName: 'id' }])
  idOperador2: Operadores;

  @ManyToOne(() => Turnos, (turnos) => turnos.viajes, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdTurno', referencedColumnName: 'id' }])
  idTurno2: Turnos;

  @ManyToMany(
    () => ConteoPasajeros,
    (conteoPasajeros) => conteoPasajeros.viajes,
  )
  conteoPasajeros: ConteoPasajeros[];

  @OneToMany(
    () => ConteoPasajeros,
    (conteoPasajeros) => conteoPasajeros.idViaje2,
  )
  conteoPasajerosDirectos: ConteoPasajeros[];

  @OneToMany(() => ViajesConteos, (vc) => vc.viaje)
  viajesConteos: ViajesConteos[];
}
