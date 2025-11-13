import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_Tarifas_Variantes", ["idVariante"], {})
@Entity("Tarifas")
export class Tarifas {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("decimal", { name: "TarifaBase", precision: 10, scale: 2 })
  tarifaBase: number;

  @Column("decimal", { name: "DistanciaBaseKm", precision: 10, scale: 2 })
  distanciaBaseKm: number;

  @Column("int", { name: "IncrementoCadaMetros" })
  incrementoCadaMetros: number;

  @Column("decimal", { name: "CostoAdicional", precision: 10, scale: 2 })
  costoAdicional: number;

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

  @Column("bigint", { name: "IdVariante" })
  idVariante: number;

}
