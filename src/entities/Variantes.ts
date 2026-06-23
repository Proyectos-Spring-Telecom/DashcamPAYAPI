import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Rutas } from "./Rutas";
import { Tarifas } from "./Tarifas";
import { Viajes } from "./Viajes";
import { CatTipoVariante } from "./CatTipoVariante";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_Variantes_Rutas", ["idRuta"], {})
@Index("FK_Variante_TipoVariante", ["idTipoVariante"], {})
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

  @Column("bigint", { name: "IdVarianteIda", nullable: true })
  idVarianteIda: number | null;

  @Column("bigint", { name: "IdTipoVariante", nullable: true })
  idTipoVariante: number | null;

  @ManyToOne(() => Rutas, (rutas) => rutas.variantes, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdRuta", referencedColumnName: "id" }])
  idRuta2: Rutas;

  @ManyToOne(() => CatTipoVariante, (catTipoVariante) => catTipoVariante.variantes, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdTipoVariante", referencedColumnName: "id" }])
  tipoVariante: CatTipoVariante;

  @OneToMany(() => Tarifas, (tarifas) => tarifas.idVariante2)
  tarifas: Tarifas[];

  @OneToMany(() => Viajes, (viajes) => viajes.idVariante2)
  viajes: Viajes[];
}

