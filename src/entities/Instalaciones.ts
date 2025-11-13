import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";
import { Validadores } from "./Validadores";
import { Contadores } from "./Contadores";
import { Vehiculos } from "./Vehiculos";

@applySchema
@Index(
  "IX_Instalaciones_IdCliente_IdValidador",
  ["idCliente", "idValidador"],
  {}
)
@Index("IX_Instalaciones_IdCliente_IdContador", ["idCliente", "idContador"], {})
@Index("IX_Instalaciones_IdCliente_IdVehiculo", ["idCliente", "idVehiculo"], {})
@Index("FK_Instalaciones_Clientes", ["idCliente"], {})
@Entity("Instalaciones")
export class Instalaciones {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

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

  @Column("bigint", { name: "IdValidador" })
  idValidador: number;

  @Column("bigint", { name: "IdContador" })
  idContador: number;

  @Column("bigint", { name: "IdVehiculo" })
  idVehiculo: number;

  @Column("bigint", { name: "IdCliente" })
  idCliente: number;

  @ManyToOne(() => Validadores, (validadores) => validadores.instalaciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([
    { name: "IdCliente", referencedColumnName: "idCliente" },
    { name: "IdValidador", referencedColumnName: "id" },
  ])
  validadores: Validadores;

  @ManyToOne(() => Contadores, (contadores) => contadores.instalaciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([
    { name: "IdCliente", referencedColumnName: "idCliente" },
    { name: "IdContador", referencedColumnName: "id" },
  ])
  contadores: Contadores;

  @ManyToOne(() => Vehiculos, (vehiculos) => vehiculos.instalaciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([
    { name: "IdCliente", referencedColumnName: "idCliente" },
    { name: "IdVehiculo", referencedColumnName: "id" },
  ])
  vehiculos: Vehiculos;
}
