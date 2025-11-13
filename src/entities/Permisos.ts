import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { applySchema } from "src/common/apply-schema.decorator";
import { Modulos } from "./Modulos";

@applySchema
@Index("UQ_Permisos_IdModulo_Nombre", ["nombre", "idModulo"], { unique: true })
@Index("FK_Permisos_Modulo", ["idModulo"], {})
@Entity("Permisos")
export class Permisos {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("varchar", { name: "Nombre", length: 100 })
  nombre: string;

  @Column("varchar", { name: "Descripcion", nullable: true, length: 255 })
  descripcion: string | null;

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

  @Column("tinyint", { name: "Estatus", nullable: true, default: () => "'1'" })
  estatus: number | null;

  @Column("bigint", { name: "IdModulo" })
  idModulo: number;

  @ManyToOne(() => Modulos, (modulos) => modulos.permisos, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdModulo", referencedColumnName: "id" }])
  idModulo2: Modulos;
}
