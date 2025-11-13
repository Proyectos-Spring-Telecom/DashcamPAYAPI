import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Clientes } from "./Clientes";
import { Instalaciones } from "./Instalaciones";
import { applySchema } from "src/common/apply-schema.decorator";
import { ConteoPasajeros } from "./ConteoPasajeros";

@applySchema
@Index("UQ_Contadores_NumeroSerie", ["numeroSerie"], { unique: true })
@Index("UQ_Contadores_IdCliente_Id", ["id", "idCliente"], { unique: true })
@Index("FK_Contadores_Clientes", ["idCliente"], {})
@Entity("Contadores")
export class Contadores {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("varchar", { name: "NumeroSerie", unique: true, length: 100 })
  numeroSerie: string;

  @Column("varchar", { name: "Marca", nullable: true, length: 100 })
  marca: string | null;

  @Column("varchar", { name: "Modelo", nullable: true, length: 100 })
  modelo: string | null;

  @Column("datetime", {
    name: "FechaCreacion",
    default: () => "CURRENT_TIMESTAMP",
  })
  fechaCreacion: Date;

  @Column("datetime", {
    name: "FechaActualizacion",
    default: () => "CURRENT_TIMESTAMP",
  })
  fechaActualizacion: Date;

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

  @OneToMany(
    () => ConteoPasajeros,
    (conteoPasajeros) => conteoPasajeros.numeroSerieContador
  )
  conteoPasajeros: ConteoPasajeros[];

  @OneToMany(() => Instalaciones, (instalaciones) => instalaciones.contadores)
  instalaciones: Instalaciones[];
}
