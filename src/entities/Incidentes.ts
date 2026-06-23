import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Instalaciones } from "./Instalaciones";
import { Operadores } from "./Operadores";
import { applySchema } from "src/common/apply-schema.decorator";

@applySchema
@Index("FK_Incidentes_Instalacion", ["idInstalacion"], {})
@Index("FK_Incidentes_Operadores", ["idOperador"], {})
@Entity("Incidentes")
export class Incidentes {
  @PrimaryGeneratedColumn({ type: "bigint", name: "Id" })
  id: number;

  @Column("bigint", { name: "IdInstalacion" })
  idInstalacion: number;

  @Column("datetime", {
    name: "FHRegistro",
    nullable: true,
  })
  fhRegistro: string | null;

  @Column("bigint", { name: "IdOperador" })
  idOperador: number;

  @Column("varchar", { name: "Incidente", nullable: true, length: 1000 })
  incidente: string | null;

  @Column("int", { name: "IdEstatus", nullable: true })
  idEstatus: number | null;

  @Column("int", { name: "Estatus", nullable: true, default: () => "'1'" })
  estatus: number | null;

  @Column("varchar", { name: "Imagen", nullable: true, length: 1000 })
  imagen: string | null;

  @ManyToOne(() => Instalaciones, (instalaciones) => instalaciones.incidentes, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdInstalacion", referencedColumnName: "id" }])
  instalacion: Instalaciones | null;

  @ManyToOne(() => Operadores, (operadores) => operadores.incidentes, {
    onDelete: "NO ACTION",
    onUpdate: "NO ACTION",
  })
  @JoinColumn([{ name: "IdOperador", referencedColumnName: "id" }])
  operador: Operadores | null;
}

