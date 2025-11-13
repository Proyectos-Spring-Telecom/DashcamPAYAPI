import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_Variantes_Rutas", ["idRuta"], {})
@Entity("Variantes")
export class Variantes {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("varchar", { name: "Nombre", length: 100 })
  nombre: string;

  @Column("json", { name: "PuntoInicio", nullable: true })
  puntoInicio: object | null;

  @Column("json", { name: "PuntoFin", nullable: true })
  puntoFin: object | null;

  @Column("json", { name: "RecorridoDetallado", nullable: true })
  recorridoDetallado: object | null;

  @Column("json", { name: "RecorridoInterpolar", nullable: true })
  recorridoInterpolar: object | null;

  @Column("decimal", {
    name: "DistanciaKm",
    nullable: true,
    precision: 10,
    scale: 2,
    default: () => "'0.00'",
  })
  distanciaKm: number | null;

  @Column("datetime", {
    name: "FechaCreacion",
    default: () => "CURRENT_TIMESTAMP",
  })
  fechaCreacion: Date;

  @Column("datetime", {
    name: "FechaActualizacion",
    default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP",
  })
  fechaActualizacion: Date;

  @Column("tinyint", { name: "Estatus", default: () => "'1'" })
  estatus: number;

  @Column("bigint", { name: "IdRuta" })
  idRuta: number;
}
