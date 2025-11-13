import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";
import { Monederos } from "./Monederos";
import { Validadores } from "./Validadores";

@applySchema
@Index(
  "IX_Transacciones_NumeroSerieMonedero_FechaHora",
  ["fechaHora", "numeroSerieMonedero"],
  {}
)
@Index(
  "IX_Transacciones_NumeroSerieValidador_FechaHora",
  ["fechaHora", "numeroSerieValidador"],
  {}
)
@Entity("Transacciones")
export class Transacciones {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("varchar", { name: "TipoTransaccion", length: 10 })
  tipoTransaccion: string;

  @Column("decimal", { name: "Monto", precision: 10, scale: 2 })
  monto: number;

  @Column("decimal", {
    name: "Latitud",
    nullable: true,
    precision: 10,
    scale: 7,
  })
  latitud: number | null;

  @Column("decimal", {
    name: "Longitud",
    nullable: true,
    precision: 10,
    scale: 7,
  })
  longitud: number | null;

  @Column("datetime", { name: "FechaHora" })
  fechaHora: Date;

  @Column("datetime", {
    name: "FHRegistro",
    default: () => "CURRENT_TIMESTAMP",
  })
  fhRegistro: Date;

  @Column("varchar", { name: "NumeroSerieMonedero", length: 100 })
  numeroSerieMonedero: string;

  @Column("varchar", { name: "NumeroSerieValidador", length: 100 })
  numeroSerieValidador: string;

  @ManyToOne(() => Validadores, (validador) => validador.transacciones, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "NumeroSerieValidador", referencedColumnName: "numeroSerie" }])
  validador: Validadores;
}
