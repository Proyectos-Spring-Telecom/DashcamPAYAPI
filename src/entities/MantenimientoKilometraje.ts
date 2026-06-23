import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Instalaciones } from "./Instalaciones";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_MttoKilometraje_Instalacion", ["idInstalacion"], {})
@Entity("MantenimientoKilometraje")
export class MantenimientoKilometraje {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("bigint", { name: "IdInstalacion", nullable: true })
  idInstalacion: number | null;

  @Column("float", { name: "KMinicial", nullable: true })
  kmInicial: number | null;

  @Column("float", { name: "KMDeseado", nullable: true })
  kmDeseado: number | null;

  @Column("int", { name: "Periodo", nullable: true })
  periodo: number | null;

  @Column("int", { name: "Anio", nullable: true })
  anio: number | null;

  @Column("datetime", {
    name: "FHRegistro",
    nullable: true,
    default: () => "CURRENT_TIMESTAMP",
  })
  fhRegistro: Date | null;

  @Column("tinyint", { name: "Estatus", nullable: true, default: () => "'1'" })
  estatus: number | null;

  @ManyToOne(() => Instalaciones, (instalaciones) => instalaciones.mantenimientosKilometraje, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdInstalacion", referencedColumnName: "id" }])
  instalacion: Instalaciones | null;
}


