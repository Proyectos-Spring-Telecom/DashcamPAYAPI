import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";
import { Contadores } from "./Contadores";

@applySchema
@Index(
  "IX_ConteoPasajeros_Serie_FechaHora",
  ["fechaHora", "numeroSerieContador"],
  {}
)
@Entity("ConteoPasajeros")
export class ConteoPasajeros {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("int", { name: "Entradas", nullable: true, default: () => "'0'" })
  entradas: number | null;

  @Column("int", { name: "Salidas", nullable: true, default: () => "'0'" })
  salidas: number | null;

  @Column("int", { name: "Diferencia" })
  diferencia: number;

  @Column("datetime", { name: "FechaHora" })
  fechaHora: Date;

  @Column("datetime", {
    name: "FHRegistro",
    default: () => "CURRENT_TIMESTAMP",
  })
  fhRegistro: Date;

  @Column("varchar", { name: "NumeroSerieContador", length: 100 })
  numeroSerieContador: string;

  @ManyToOne(() => Contadores, (contador) => contador.conteoPasajeros)
  @JoinColumn([
    { name: "NumeroSerieContador", referencedColumnName: "numeroSerie" },
  ])
  numeroSerieContadores2: Contadores;
}
