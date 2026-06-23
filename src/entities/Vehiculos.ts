import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Instalaciones } from './Instalaciones';
import { Clientes } from './Clientes';
import { applySchema } from 'src/common/apply-schema.decorator';

@applySchema
@Index('UQ_Vehiculos_Placa', ['placa'], { unique: true })
@Index('UQ_Vehiculos_IdCliente_Id', ['id', 'idCliente'], { unique: true })
@Index('FK_Vehiculos_Clientes', ['idCliente'], {})
@Entity('Vehiculos')
export class Vehiculos {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'Id' })
  id: number;

  @Column('varchar', { name: 'Marca', length: 255 })
  marca: string;

  @Column('varchar', { name: 'Modelo', length: 100 })
  modelo: string;

  @Column('int', { name: 'Ano' })
  ano: number;

  @Column('varchar', { name: 'Placa', unique: true, length: 10 })
  placa: string;

  @Column('varchar', { name: 'NumeroEconomico', length: 50 })
  numeroEconomico: string;

  @Column('varchar', {
    name: 'TarjetaCirculacion',
    nullable: true,
    length: 500,
  })
  tarjetaCirculacion: string | null;

  @Column('varchar', { name: 'PolizaSeguro', nullable: true, length: 500 })
  polizaSeguro: string | null;

  @Column('varchar', { name: 'PermisoConcesion', nullable: true, length: 500 })
  permisoConcesion: string | null;

  @Column('varchar', {
    name: 'InspeccionMecanica',
    nullable: true,
    length: 500,
  })
  inspeccionMecanica: string | null;

  @Column('varchar', { name: 'Foto', nullable: true, length: 500 })
  foto: string | null;

  @Column('int', { name: 'PasajerosSentados', nullable: true, unsigned: true })
  pasajerosSentados: number;

  @Column('int', { name: 'PasajerosParados', nullable: true, unsigned: true })
  pasajerosParados: number;

  @Column('int', { name: 'CantidadPuertas', nullable: true })
  cantidadPuertas: number | null;

  @Column('datetime', {
    name: 'FechaCreacion',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion: string;

  @Column('datetime', {
    name: 'FechaActualizacion',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaActualizacion: string;

  @Column('tinyint', { name: 'Estatus', default: () => "'1'" })
  estatus: number;

  @Column('tinyint', { name: 'EstadoActual', unsigned: true })
  estadoActual: number;

  @Column('bigint', { name: 'IdCliente' })
  idCliente: number;

  @Column('float', { name: 'KM', nullable: true })
  km: number;

  @Column('bigint', { name: 'IdCombustible', nullable: true })
  idCombustible: number;

  @Column('float', { name: 'CapacidadLitros', nullable: true })
  capacidadLitros: number;

  @OneToMany(() => Instalaciones, (instalaciones) => instalaciones.vehiculos)
  instalaciones: Instalaciones[];

  @ManyToOne(() => Clientes, (clientes) => clientes.vehiculos, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn([{ name: 'IdCliente', referencedColumnName: 'id' }])
  idCliente2: Clientes;
}
