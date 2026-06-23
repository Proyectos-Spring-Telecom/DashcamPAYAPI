import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Instalaciones } from "./Instalaciones";
import { CatEstatusMantenimiento } from "./CatEstatusMantenimiento";
import { Talleres } from "./Talleres";
import { CatReferenciaServicio } from "./CatReferenciaServicio";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_MttoVehicular_Instalacion", ["idInstalacion"], {})
@Index("FK_MttoVehicular_Estatus", ["idEstatus"], {})
@Index("FK_MttoVehicular_Taller", ["idTaller"], {})
@Entity("MantenimientoVehicular")
export class MantenimientoVehicular {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("bigint", { name: "IdInstalacion", nullable: true })
  idInstalacion: number | null;

  @Column("bigint", { name: "IdReferencia", nullable: true })
  idReferencia: number | null;

  @Column("varchar", { name: "ServicioDescripcion", nullable: true, length: 1000 })
  servicioDescripcion: string | null;

  @Column("varchar", { name: "NotaServicio", nullable: true, length: 1000 })
  notaServicio: string | null;

  @Column("int", { name: "IdEstatus", nullable: true })
  idEstatus: number | null;

  @Column("datetime", { name: "FechaInicio", nullable: true })
  fechaInicio: string | null;

  @Column("datetime", { name: "FechaFinal", nullable: true })
  fechaFinal: string | null;

  @Column("bigint", { name: "IdTaller", nullable: true })
  idTaller: number | null;

  @Column("decimal", { name: "Costo", nullable: true, precision: 10, scale: 2 })
  costo: number | null;

  @Column("varchar", { name: "Encargado", nullable: true, length: 200 })
  encargado: string | null;

  @Column("datetime", {
    name: "FHRegistro",
    nullable: true,
    default: () => "CURRENT_TIMESTAMP",
  })
  fhRegistro: string | null;

  @Column("tinyint", { name: "Estatus", nullable: true, default: () => "'1'" })
  estatus: number | null;

  @ManyToOne(() => Instalaciones, (instalaciones) => instalaciones.mantenimientosVehiculares, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdInstalacion", referencedColumnName: "id" }])
  instalacion: Instalaciones | null;

  @ManyToOne(() => CatEstatusMantenimiento, (catEstatusMantenimiento) => catEstatusMantenimiento.mantenimientosVehiculares, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdEstatus", referencedColumnName: "id" }])
  idEstatusRelacion: CatEstatusMantenimiento | null;

  @ManyToOne(() => Talleres, (talleres) => talleres.mantenimientosVehiculares, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdTaller", referencedColumnName: "id" }])
  taller: Talleres | null;

  @ManyToOne(() => CatReferenciaServicio, (catReferenciaServicio) => catReferenciaServicio.mantenimientosVehiculares, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdReferencia", referencedColumnName: "id" }])
  referenciaServicio: CatReferenciaServicio | null;
}


