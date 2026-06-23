import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuarios } from './Usuarios';
import { Turnos } from './Turnos';
import { Viajes } from './Viajes';
import { Verificaciones } from './Verificaciones';
import { MantenimientoCombustible } from './MantenimientoCombustible';
import { Incidentes } from './Incidentes';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('UQ_Operadores_IdUsuario', ['idUsuario'], { unique: true })
@Entity('Operadores')
export class Operadores {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('date', { name: 'FechaNacimiento' })
  fechaNacimiento: string;

  @Column('varchar', { name: 'Identificacion', nullable: true, length: 500 })
  identificacion: string | null;

  @Column('varchar', { name: 'Licencia', nullable: true, length: 500 })
  licencia: string | null;

  @Column('varchar', { name: 'NumeroLicencia', nullable: true, length: 20 })
  numeroLicencia: string | null;

  @Column('varchar', {
    name: 'ComprobanteDomicilio',
    nullable: true,
    length: 500,
  })
  comprobanteDomicilio: string | null;

  @Column('varchar', {
    name: 'CertificadoMedico',
    nullable: true,
    length: 500,
  })
  certificadoMedico: string | null;

  @Column('varchar', {
    name: 'AntecedentesNoPenales',
    nullable: true,
    length: 500,
  })
  antecedentesNoPenales: string | null;

  @Column('varchar', { name: 'Foto', nullable: true, length: 500 })
  foto: string | null;

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

  @Column('bigint', { name: 'IdUsuario', unique: true })
  idUsuario: number;

  @OneToOne(() => Usuarios, (usuarios) => usuarios.operadores, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdUsuario', referencedColumnName: 'id' }])
  idUsuario2: Usuarios;

  @OneToMany(() => Turnos, (turnos) => turnos.idOperador2)
  turnos: Turnos[];

  @OneToMany(() => Viajes, (viajes) => viajes.idOperador2)
  viajes: Viajes[];

  @OneToMany(() => Verificaciones, (verificaciones) => verificaciones.operador)
  verificaciones: Verificaciones[];

  @OneToMany(
    () => MantenimientoCombustible,
    (mantenimientoCombustible) => mantenimientoCombustible.operador,
  )
  mantenimientosCombustible: MantenimientoCombustible[];

  @OneToMany(() => Incidentes, (incidentes) => incidentes.operador)
  incidentes: Incidentes[];
}
