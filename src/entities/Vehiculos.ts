import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";
import { Instalaciones } from "./Instalaciones";

@applySchema
@Index("UQ_Vehiculos_Placa", ["placa"], { unique: true })
@Index("UQ_Vehiculos_IdCliente_Id", ["id", "idCliente"], { unique: true })
@Index("FK_Vehiculos_Clientes", ["idCliente"], {})
@Entity("Vehiculos")
export class Vehiculos {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("varchar", { name: "Marca", length: 255 })
  marca: string;

  @Column("varchar", { name: "Modelo", length: 100 })
  modelo: string;

  @Column("int", { name: "Ano" })
  ano: number;

  @Column("varchar", { name: "Placa", unique: true, length: 10 })
  placa: string;

  @Column("varchar", { name: "NumeroEconomico", length: 50 })
  numeroEconomico: string;

  @Column("varchar", {
    name: "TarjetaCirculacion",
    nullable: true,
    length: 500,
  })
  tarjetaCirculacion: string | null;

  @Column("varchar", { name: "PolizaSeguro", nullable: true, length: 500 })
  polizaSeguro: string | null;

  @Column("varchar", { name: "PermisoConcesion", nullable: true, length: 500 })
  permisoConcesion: string | null;

  @Column("varchar", {
    name: "InspeccionMecanica",
    nullable: true,
    length: 500,
  })
  inspeccionMecanica: string | null;

  @Column("varchar", { name: "Foto", nullable: true, length: 500 })
  foto: string | null;

  @Column("datetime", {
    name: "FechaCreacion",
    default: () => "CURRENT_TIMESTAMP",
  })
  fechaCreacion: string;

  @Column("datetime", {
    name: "FechaActualizacion",
    default: () => "CURRENT_TIMESTAMP",
  })
  fechaActualizacion: string;

  @Column("tinyint", { name: "Estatus", default: () => "'1'" })
  estatus: number;

  @Column("tinyint", {
    name: "EstadoActual",
    unsigned: true,
    default: () => "'1'",
  })
  estadoActual: number;

  @Column("bigint", { name: "IdCliente" })
  idCliente: number;

  @OneToMany(() => Instalaciones, (instalaciones) => instalaciones.vehiculos)
  instalaciones: Instalaciones[];

}
